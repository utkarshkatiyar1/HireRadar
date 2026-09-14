const router   = require('express').Router();
const mongoose = require('mongoose');
const path     = require('path');
const fs       = require('fs');
const { requireAuth } = require('../middleware/auth');
const { Job } = require('../utils/db');
const { Application } = require('../models/application');
const { transition, InvalidTransitionError } = require('../utils/applicationState');
const { effectivePostedAt } = require('../utils/recency');
const { discoverApplicationsForUser } = require('../utils/applicationDiscovery');
const { getApplyQueue, getPipelineQueue, getInspectionQueue } = require('../queue/queues');
const { buildSignedScreenshotUrl, verifyScreenshotSignature } = require('../utils/screenshotSigning');

const SCREENSHOT_DIR = path.join(__dirname, '..', '..', 'uploads', 'screenshots');

const oid = (s) => new mongoose.Types.ObjectId(s);

// Must mirror client/src/pages/ApprovalQueuePage.jsx's BUCKETS exactly —
// this is what the sidebar/header "Needs Action" badge counts (see
// /applications/counts below), and drifted from the actual tab contents
// once READY_FOR_PREPARATION/DRY_RUN_COMPLETED moved into Needs Action.
const NEEDS_ACTION = ['READY_FOR_PREPARATION', 'READY_FOR_APPROVAL', 'ACTION_REQUIRED', 'DRY_RUN_COMPLETED'];

// GET /applications — read-only, no side effects. Supports status/company/
// minScore filters, pagination, and explicit sort modes.
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const { status, company, minScore, maxAgeDays, page = 1, limit = 50, sort = 'recent' } = req.query;

    const filter = { userId };
    if (status) filter.status = { $in: status.split(',') };
    if (minScore) filter['fitScore.total'] = { $gte: Number(minScore) };

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Number(limit));

    // 'updated_recent' and no company filter: sort/paginate at the DB level
    // using the indexed lastStatusChangeAt field, instead of loading every
    // matching Application into Node first. This is the path Issues/Done use
    // (routes: ApprovalQueuePage.jsx) — with REJECTED alone in the
    // thousands, the old load-everything-then-sort-in-memory approach was
    // the actual cause of those tabs feeling slow. Other sort modes
    // (recent/best_match/recent_high_match/easy_apply) depend on the JOB's
    // postedAt or fitScore/formInspection, which live outside a single
    // indexable Application field, so they still need the in-memory path
    // below until job data is denormalized too.
    if (sort === 'updated_recent' && !company) {
      const [total, apps] = await Promise.all([
        Application.countDocuments(filter),
        Application.find(filter)
          .sort({ lastStatusChangeAt: -1 })
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum)
          .lean(),
      ]);
      const jobs = await Job.find({ _id: { $in: apps.map(a => a.jobId) } }).lean();
      const jobById = new Map(jobs.map(j => [String(j._id), j]));
      const applications = apps
        .filter(a => jobById.has(String(a.jobId)))
        .map(a => ({ ...a, job: jobById.get(String(a.jobId)) }));

      return res.json({ total, page: pageNum, limit: limitNum, applications });
    }

    const apps = await Application.find(filter).lean();
    const jobIds = apps.map(a => a.jobId);
    const jobs = await Job.find(company ? { _id: { $in: jobIds }, company } : { _id: { $in: jobIds } }).lean();
    const jobById = new Map(jobs.map(j => [String(j._id), j]));

    let merged = apps
      .filter(a => jobById.has(String(a.jobId)))
      .map(a => ({ ...a, job: jobById.get(String(a.jobId)) }));

    // maxAgeDays: excludes jobs whose effectivePostedAt is older than the
    // cutoff. Only meaningful here (not in the updated_recent fast-path
    // above), which sorts by the APPLICATION's own status-change time for
    // Done/Issues/In-Progress — job posting age isn't the relevant axis
    // there, and that path deliberately joins Job data AFTER pagination to
    // stay cheap, so it has no per-row job date to filter on before paging.
    if (maxAgeDays) {
      const cutoff = Date.now() - Number(maxAgeDays) * 24 * 60 * 60 * 1000;
      merged = merged.filter(a => new Date(effectivePostedAt(a.job)).getTime() >= cutoff);
    }

    const byRecency = (a, b) =>
      new Date(effectivePostedAt(b.job)) - new Date(effectivePostedAt(a.job))
      || (b.job.postedAtConfidence ?? 0) - (a.job.postedAtConfidence ?? 0);
    const byScore = (a, b) => (b.fitScore?.total ?? 0) - (a.fitScore?.total ?? 0);
    const lastChangedAt = (a) => new Date(a.lastStatusChangeAt || a.updatedAt || 0);
    const byUpdatedRecency = (a, b) => lastChangedAt(b) - lastChangedAt(a);

    if (sort === 'best_match') merged.sort((a, b) => byScore(a, b) || byRecency(a, b));
    else if (sort === 'recent_high_match') merged.sort((a, b) => byRecency(a, b) || byScore(a, b));
    else if (sort === 'easy_apply') merged.sort((a, b) => (a.formInspection?.fields?.length ?? 99) - (b.formInspection?.fields?.length ?? 99) || byRecency(a, b));
    else if (sort === 'updated_recent') merged.sort(byUpdatedRecency); // reached only when `company` filter is set
    else merged.sort(byRecency); // 'recent' (default)

    const start = (pageNum - 1) * limitNum;
    const paged = merged.slice(start, start + limitNum);

    res.json({ total: merged.length, page: pageNum, limit: limitNum, applications: paged });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /applications/counts — single cheap aggregate for sidebar badge / queue
// header / app shell, so the UI never needs multiple independent pollers.
router.get('/counts', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const day0 = new Date(); day0.setUTCHours(0, 0, 0, 0);

    const [needsAction, readyForApproval, applying, submittedToday] = await Promise.all([
      Application.countDocuments({ userId, status: { $in: NEEDS_ACTION } }),
      Application.countDocuments({ userId, status: 'READY_FOR_APPROVAL' }),
      Application.countDocuments({ userId, status: 'APPLYING' }),
      // SUBMITTED (automated) and APPLIED_MANUALLY (user applied outside the
      // tool) both represent a completed application and both stamp
      // appliedAt — see POST /:id/applied-manually and applyProcessor.js.
      Application.countDocuments({ userId, status: { $in: ['SUBMITTED', 'APPLIED_MANUALLY'] }, appliedAt: { $gte: day0 } }),
    ]);

    res.json({ needsAction, readyForApproval, applying, submittedToday });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /applications/:id — full detail including answers, fitScore breakdown, auditLog
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const application = await Application.findOne({ _id: oid(req.params.id), userId }).lean();
    if (!application) return res.status(404).json({ error: 'Not found' });
    const job = await Job.findById(application.jobId).lean();
    res.json({ ...application, job });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /applications/:id/prepare — the ONLY way form-inspection and answer
// generation ever start. A recommended (READY_FOR_PREPARATION) application
// sits there until the user explicitly asks for it to be prepared — this is
// what keeps LLM + Playwright spend proportional to actual intent to apply,
// not every job that merely passes eligibility/fit-scoring.
router.post('/:id/prepare', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const application = await Application.findOne({ _id: oid(req.params.id), userId });
    if (!application) return res.status(404).json({ error: 'Not found' });
    if (application.status !== 'READY_FOR_PREPARATION') {
      return res.status(409).json({ error: `Cannot prepare an application in status ${application.status}` });
    }

    await getPipelineQueue().add('prepareTrigger', { applicationId: application._id.toString() });
    res.json({ ok: true, message: 'Preparation started' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /applications/bulk-prepare — { applicationIds: string[] }
// Starts form-inspection+answer-drafting for up to BULK_PREPARE_MAX
// applications in one call. This is the batch counterpart to
// POST /:id/prepare, added so the review workflow can be "select N matched
// jobs, move them all to prepare" instead of clicking Prepare one at a time.
// Capped (not unlimited) deliberately — this fans out real Playwright
// browser launches + LLM calls per application; an unbounded batch risks
// blowing through LLM budget or firing enough concurrent browser sessions at
// once to look like automated abuse to the target ATS.
const BULK_PREPARE_MAX = 15;

router.post('/bulk-prepare', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const { applicationIds } = req.body;
    if (!Array.isArray(applicationIds) || !applicationIds.length) {
      return res.status(400).json({ error: 'applicationIds must be a non-empty array' });
    }
    if (applicationIds.length > BULK_PREPARE_MAX) {
      return res.status(400).json({ error: `Cannot prepare more than ${BULK_PREPARE_MAX} applications at once (got ${applicationIds.length})` });
    }

    const applications = await Application.find({
      _id: { $in: applicationIds.map(oid) },
      userId,
      status: 'READY_FOR_PREPARATION',
    });

    const preparable = applications.map(a => a._id.toString());
    const skipped = applicationIds.filter(id => !preparable.includes(id));

    if (preparable.length) {
      await getPipelineQueue().addBulk(
        preparable.map(applicationId => ({ name: 'prepareTrigger', data: { applicationId } }))
      );
    }

    res.json({ ok: true, started: preparable.length, skipped });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /applications/bulk-submit — { applicationIds: string[] }
// Submits up to BULK_SUBMIT_MAX already-APPROVED applications in one call.
// Deliberately scoped to APPROVED only — every one of these was already
// individually reviewed (drafted answers looked at, tier checked) at the
// POST /:id/approve step; this only batches the mechanical "now actually
// submit it" step, it does NOT let a human skip looking at any application's
// answers. That's the real difference from a hypothetical "bulk-approve
// sight-unseen" — this endpoint intentionally does not exist, since it would
// re-open exactly the wrong-answer/no-review risk the approval gate exists
// to prevent. Same MANUAL-tier guard as POST /:id/submit, re-checked here
// too since PipelineConfig/the application's tier could still have changed
// between approval and this call.
const BULK_SUBMIT_MAX = 15;

router.post('/bulk-submit', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const { applicationIds } = req.body;
    if (!Array.isArray(applicationIds) || !applicationIds.length) {
      return res.status(400).json({ error: 'applicationIds must be a non-empty array' });
    }
    if (applicationIds.length > BULK_SUBMIT_MAX) {
      return res.status(400).json({ error: `Cannot submit more than ${BULK_SUBMIT_MAX} applications at once (got ${applicationIds.length})` });
    }

    const applications = await Application.find({
      _id: { $in: applicationIds.map(oid) },
      userId,
      status: 'APPROVED',
    });

    const submittable = [];
    const blockedManual = [];
    for (const application of applications) {
      if (application.confidenceTier === 'MANUAL') {
        blockedManual.push(application._id.toString());
        continue;
      }
      transition(application, 'APPLYING', 'bulk submit trigger');
      await application.save();
      submittable.push(application._id.toString());
    }

    if (submittable.length) {
      await getApplyQueue().addBulk(
        submittable.map(applicationId => ({ name: 'submit', data: { applicationId } }))
      );
    }

    const skipped = applicationIds.filter(id => !submittable.includes(id) && !blockedManual.includes(id));
    res.json({ ok: true, started: submittable.length, blockedManual, skipped });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /applications/:id/reprepare — re-runs resume routing, answer
// drafting, and verification on an already-drafted (READY_FOR_APPROVAL)
// application, without re-inspecting the form (its fields/platform haven't
// changed). Real use case: your Candidate Profile was incomplete when this
// was first prepared, so most answers came back null — after filling in
// facts/profile fields, re-running preparation picks them up without
// needing an admin retry or waiting for a fresh scrape cycle.
router.post('/:id/reprepare', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const application = await Application.findOne({ _id: oid(req.params.id), userId });
    if (!application) return res.status(404).json({ error: 'Not found' });
    if (application.status !== 'READY_FOR_APPROVAL') {
      return res.status(409).json({ error: `Cannot reprepare an application in status ${application.status}` });
    }

    transition(application, 'PREPARING', 'user requested reprepare');
    await application.save();

    await getPipelineQueue().add('prepare', { applicationId: application._id.toString() });
    res.json({ ok: true, message: 'Reprepare started' });
  } catch (e) {
    if (e instanceof InvalidTransitionError) return res.status(409).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// POST /applications/:id/reinspect — forces a fresh form-inspection (real
// browser, real DOM re-extraction), then proceeds through preparation same
// as the original prepare flow. Distinct from reprepare above: reprepare
// reuses the EXISTING formInspection.fields snapshot, which does nothing
// when the bad data is IN that snapshot (e.g. a site-search widget or
// CAPTCHA response field that got mis-extracted as a real question — see
// form-inspector/extractFields.js's incident comments; a bug fix there only
// helps applications inspected AFTER the fix, not ones already snapshotted
// with the bad field baked in). Only a real re-inspection re-runs DOM
// extraction and can actually drop a field like that.
router.post('/:id/reinspect', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const application = await Application.findOne({ _id: oid(req.params.id), userId });
    if (!application) return res.status(404).json({ error: 'Not found' });
    if (!['READY_FOR_APPROVAL', 'DRY_RUN_COMPLETED'].includes(application.status)) {
      return res.status(409).json({ error: `Cannot reinspect an application in status ${application.status}` });
    }

    transition(application, 'INSPECTING_FORM', 'user requested reinspect — re-running form inspection');
    await application.save();

    await getInspectionQueue().add('inspect', { applicationId: application._id.toString() });
    res.json({ ok: true, message: 'Reinspect started' });
  } catch (e) {
    if (e instanceof InvalidTransitionError) return res.status(409).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// POST /applications/:id/approve — { resumeVariantId?, submit: boolean }
// "Approve & Submit" (submit:true) vs "Approve Draft" (submit:false) are two
// explicit, unambiguous actions — approving never silently defers submission.
router.post('/:id/approve', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const { resumeVariantId, submit } = req.body;
    const application = await Application.findOne({ _id: oid(req.params.id), userId });
    if (!application) return res.status(404).json({ error: 'Not found' });

    // confidenceTier is set once by agents/pipeline.js's runPreparation and
    // is otherwise purely advisory for the UI to display — nothing
    // previously stopped a direct API call (or a UI bug) from submitting a
    // MANUAL-tier application, which exists specifically to force a human to
    // look at sensitive/low-confidence answers (salary, work authorization,
    // etc — see agents/computeTier.js) before they go out.
    if (submit && application.confidenceTier === 'MANUAL') {
      return res.status(409).json({
        error: 'This application requires manual review before it can be submitted — one or more answers are low-confidence or touch a sensitive field (salary, work authorization, etc). Review and edit the answers, then approve as a draft first.',
      });
    }

    // submit:false (Approve Draft) IS the human review this gate exists to
    // require — clearing MANUAL here is what lets POST /:id/submit later
    // actually work. Previously this never happened: the tier stayed
    // MANUAL forever, so a MANUAL-tier application could be Approved as a
    // Draft but then had literally no path to ever being submitted through
    // this tool — a real dead end, not the "review then proceed" gate it
    // was meant to be. Reviewed_MANUAL (not AUTO/QUICK_APPROVE/etc) keeps
    // the distinction visible in the UI/audit trail that this one needed a
    // human look, without leaving it permanently blocked.
    if (!submit && application.confidenceTier === 'MANUAL') {
      application.confidenceTier = 'REVIEWED_MANUAL';
    }

    if (resumeVariantId) application.resumeVariantId = oid(resumeVariantId);
    transition(application, 'APPROVED', submit ? 'approved with submit' : 'approved as draft');
    await application.save();

    if (submit) {
      transition(application, 'APPLYING', 'auto-enqueued after approve&submit');
      await application.save();
      await getApplyQueue().add('submit', { applicationId: application._id.toString() });
    }

    res.json(application);
  } catch (e) {
    if (e instanceof InvalidTransitionError) return res.status(409).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// POST /applications/:id/applied-manually — user applied to the job
// themselves outside this tool (e.g. via the company's own site) instead of
// continuing the automated flow. Terminal, same as SUBMITTED for
// applied/appliedAt bookkeeping, but never went through our apply pipeline —
// kept as a distinct status (not SUBMITTED) so audit history/analytics can
// tell the two apart.
router.post('/:id/applied-manually', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const application = await Application.findOne({ _id: oid(req.params.id), userId });
    if (!application) return res.status(404).json({ error: 'Not found' });

    transition(application, 'APPLIED_MANUALLY', 'user applied manually outside the tool');
    application.applied = true;
    application.appliedAt = new Date();
    await application.save();
    res.json(application);
  } catch (e) {
    if (e instanceof InvalidTransitionError) return res.status(409).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// POST /applications/:id/skip — the ONLY pass-on-this-role action a regular
// user sees. REJECTED is written exclusively by the pipeline (eligibility.js)
// and is not user-triggerable here.
router.post('/:id/skip', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const { reason } = req.body;
    const application = await Application.findOne({ _id: oid(req.params.id), userId });
    if (!application) return res.status(404).json({ error: 'Not found' });

    transition(application, 'SKIPPED', reason || 'user skipped');
    application.dismissed = true;
    await application.save();
    res.json(application);
  } catch (e) {
    if (e instanceof InvalidTransitionError) return res.status(409).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// PATCH /applications/:id/answers — human edits/overrides drafted answers,
// only while still in READY_FOR_APPROVAL (can't silently rewrite a submitted app).
router.patch('/:id/answers', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const { answers } = req.body;
    const application = await Application.findOne({ _id: oid(req.params.id), userId });
    if (!application) return res.status(404).json({ error: 'Not found' });
    if (application.status !== 'READY_FOR_APPROVAL') {
      return res.status(409).json({ error: `Cannot edit answers in status ${application.status}` });
    }

    const byKey = new Map((answers || []).map(a => [a.fieldKey, a]));
    application.answers = application.answers.map(a =>
      byKey.has(a.fieldKey)
        ? { ...a.toObject(), value: byKey.get(a.fieldKey).value, source: 'manual' }
        : a
    );
    await application.save();
    res.json(application);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /applications/:id/resolve-question — { answer } — requires ACTION_REQUIRED,
// stores the answer, clears pendingQuestion, re-enqueues applyQueue so the
// adapter resumes from its persisted sessionState.
router.post('/:id/resolve-question', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const { answer } = req.body;
    const application = await Application.findOne({ _id: oid(req.params.id), userId });
    if (!application) return res.status(404).json({ error: 'Not found' });
    if (application.status !== 'ACTION_REQUIRED') {
      return res.status(409).json({ error: `Cannot resolve a question in status ${application.status}` });
    }

    if (application.pendingQuestion?.fieldKey) {
      const fieldKey = application.pendingQuestion.fieldKey;
      const idx = application.answers.findIndex(a => a.fieldKey === fieldKey);
      const resolved = { fieldKey, value: answer, factIds: [], confidence: 100, source: 'manual', verifierFlag: 'ok' };
      if (idx >= 0) application.answers[idx] = resolved;
      else application.answers.push(resolved);
    }
    application.pendingQuestion = undefined;
    application.auditLog.push({ action: 'resolve-question', detail: { answer } });

    transition(application, 'APPLYING', 'resuming after resolved question');
    await application.save();
    await getApplyQueue().add('submit', { applicationId: application._id.toString(), resumed: true });

    res.json(application);
  } catch (e) {
    if (e instanceof InvalidTransitionError) return res.status(409).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// GET /applications/:id/audit — auditLog (with signed screenshot URLs,
// never a permanent public path), confirmation, resume version used, and
// the submitted answers.
router.get('/:id/audit', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const application = await Application.findOne(
      { _id: oid(req.params.id), userId },
      { auditLog: 1, confirmation: 1, resumeVariantId: 1, answers: 1, status: 1 }
    ).lean();
    if (!application) return res.status(404).json({ error: 'Not found' });

    application.auditLog = (application.auditLog || []).map(entry => ({
      ...entry,
      screenshotUrl: entry.screenshotRef ? buildSignedScreenshotUrl(entry.screenshotRef, userId.toString()) : null,
    }));

    res.json(application);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /applications/screenshots/:filename — the ONLY way a screenshot is
// ever served; requires a valid, unexpired HMAC signature (see
// utils/screenshotSigning.js) plus a valid auth token. Never express.static.
router.get('/screenshots/:filename', requireAuth, async (req, res) => {
  const { filename } = req.params;
  const { expires, sig } = req.query;
  const userId = req.user.uid;
  if (!expires || !sig || !verifyScreenshotSignature(filename, userId, expires, sig)) {
    return res.status(403).json({ error: 'Invalid or expired signature' });
  }

  // Reject path traversal — filename must resolve to a file directly inside
  // SCREENSHOT_DIR, nothing above it.
  const filePath = path.join(SCREENSHOT_DIR, path.basename(filename));
  if (!filePath.startsWith(SCREENSHOT_DIR) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.sendFile(filePath);
});

// POST /applications/:id/submit — manual trigger for an APPROVED application
// that wasn't auto-chained via approve{submit:true} (covers DRAFT_ONLY/MANUAL/
// QUICK_APPROVE-without-auto-submit tiers).
router.post('/:id/submit', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const application = await Application.findOne({ _id: oid(req.params.id), userId });
    if (!application) return res.status(404).json({ error: 'Not found' });

    // Same guard as POST /:id/approve{submit:true} — this is the second path
    // into APPLYING (for DRAFT_ONLY/MANUAL/QUICK_APPROVE-without-auto-submit
    // tiers approved as a draft earlier), so it needs the same tier check.
    if (application.confidenceTier === 'MANUAL') {
      return res.status(409).json({
        error: 'This application requires manual review before it can be submitted — one or more answers are low-confidence or touch a sensitive field. Review and edit the answers first.',
      });
    }

    transition(application, 'APPLYING', 'manual submit trigger');
    await application.save();
    await getApplyQueue().add('submit', { applicationId: application._id.toString() });

    res.json(application);
  } catch (e) {
    if (e instanceof InvalidTransitionError) return res.status(409).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// POST /applications/discover — explicit re-run of discovery for the current
// user, in addition to the default scrape-completion trigger.
router.post('/discover', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const created = await discoverApplicationsForUser(userId);
    res.json({ applicationsCreated: created });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
