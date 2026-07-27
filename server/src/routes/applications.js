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
const { getApplyQueue, getPipelineQueue } = require('../queue/queues');
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
    const { status, company, minScore, page = 1, limit = 50, sort = 'recent' } = req.query;

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
      Application.countDocuments({ userId, status: 'SUBMITTED', appliedAt: { $gte: day0 } }),
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

// POST /applications/:id/approve — { resumeVariantId?, submit: boolean }
// "Approve & Submit" (submit:true) vs "Approve Draft" (submit:false) are two
// explicit, unambiguous actions — approving never silently defers submission.
router.post('/:id/approve', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const { resumeVariantId, submit } = req.body;
    const application = await Application.findOne({ _id: oid(req.params.id), userId });
    if (!application) return res.status(404).json({ error: 'Not found' });

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
