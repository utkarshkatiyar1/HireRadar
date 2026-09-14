const { Job } = require('../utils/db');
const CandidateProfile  = require('../models/candidateProfile');
const ApplicationPolicy = require('../models/applicationPolicy');
const ResumeVariant     = require('../models/resumeVariant');
const PipelineConfig    = require('../models/pipelineConfig');
const { Application }   = require('../models/application');
const { transition }    = require('../utils/applicationState');
const { getInspectionQueue } = require('../queue/queues');

const eligibility   = require('./eligibility');
const fitScoring    = require('./fitScoring');
const resumeRouting = require('./resumeRouting');
const answerAgent   = require('./answerAgent');
const verifier       = require('./verifier');
const computeTier    = require('./computeTier');

// Atomic find-or-create — many pipeline jobs for the same user can run
// concurrently (PIPELINE_CONCURRENCY=3+), so a check-then-create pattern here
// races and throws duplicate-key errors on the unique userId index.
const getOrSeed = async (Model, userId) =>
  Model.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { new: true, upsert: true }
  );

const getPipelineConfig = () =>
  PipelineConfig.findOneAndUpdate({ key: 'default' }, { $setOnInsert: { key: 'default' } }, { new: true, upsert: true });

// Stage 1 — 'evaluate' job on the pipeline queue.
// DISCOVERED -> EVALUATING -> REJECTED | READY_FOR_PREPARATION
//
// Runs eligibility AND fit-scoring (both deterministic-first, LLM only when
// genuinely needed — see agents/eligibility.js and agents/fitScoring.js) and
// STOPS at READY_FOR_PREPARATION as a recommendation shown to the user.
// Form-inspection and answer-generation do NOT start automatically here —
// they begin only via the explicit POST /applications/:id/prepare action
// (see runPrepare below), so LLM + Playwright spend stays proportional to
// actual intent to apply, not every job that merely passes eligibility.
async function runEvaluation(applicationId) {
  const application = await Application.findById(applicationId);
  if (!application) throw new Error(`Application ${applicationId} not found`);
  // Accepts DISCOVERED (first attempt) AND EVALUATING (a BullMQ retry after
  // eligibility()/fitScoring() threw below) — eligibility/fitScoring don't
  // persist anything themselves, so re-running them on retry is safe. Before
  // this, only DISCOVERED was accepted: the transition+save right below ran
  // on attempt 1, so by attempt 2 the guard saw EVALUATING and returned
  // early without error — a "successful" no-op that silently stranded the
  // application in EVALUATING forever instead of actually retrying.
  if (!['DISCOVERED', 'EVALUATING'].includes(application.status)) {
    return application; // already past this stage — avoid double-processing
  }

  const [job, profile, policy] = await Promise.all([
    Job.findById(application.jobId).lean(),
    getOrSeed(CandidateProfile, application.userId),
    getOrSeed(ApplicationPolicy, application.userId),
  ]);
  if (!job) throw new Error(`Job ${application.jobId} referenced by Application ${applicationId} not found`);

  application.discoverySourceType = job.sourceType || job.ats || 'UNKNOWN';

  if (application.status === 'DISCOVERED') {
    transition(application, 'EVALUATING', 'pipeline started');
    await application.save();
  }

  const eligResult = await eligibility(application, job, profile, policy);
  application.eligibility = {
    passed: eligResult.passed, reasons: eligResult.reasons, checkedAt: new Date(),
    llmStatus: eligResult.llmStatus,
  };

  // passed === null means the LLM fallback for a genuinely ambiguous
  // eligibility question (e.g. unparseable experience requirement) was
  // unavailable (quota/outage) — never auto-continue on an undecided
  // eligibility check. REJECTED here is a soft rejection with the ambiguity
  // in `reasons`, not a real disqualification; the admin retry route
  // (POST /admin/applications/:id/retry) re-runs evaluation once the LLM is
  // back, exactly like a REJECTED-for-real-reasons application would.
  if (eligResult.passed !== true) {
    transition(application, 'REJECTED', eligResult.reasons?.join('; ') || (eligResult.passed === null ? 'eligibility undecided — LLM unavailable' : 'failed eligibility'));
    await application.save();
    return application;
  }

  const fit = await fitScoring(application, job, profile);
  application.fitScore = fit;

  if (fit.total < (policy.minimumScore ?? 0)) {
    transition(application, 'REJECTED', `fitScore ${fit.total} below policy minimumScore ${policy.minimumScore}`);
    await application.save();
    return application;
  }

  transition(application, 'READY_FOR_PREPARATION', 'passed eligibility and fit-scoring — shown as recommendation');
  await application.save();

  return application;
}

// Stage 2a — triggered ONLY by POST /applications/:id/prepare (routes/applications.js),
// never automatically. READY_FOR_PREPARATION -> INSPECTING_FORM, then hands
// off to the apply-worker's inspectionQueue (real browser, form-inspector/
// inspect.js) — pipeline-worker must stay Playwright-free.
async function runPrepare(applicationId) {
  const application = await Application.findById(applicationId);
  if (!application) throw new Error(`Application ${applicationId} not found`);
  if (application.status !== 'READY_FOR_PREPARATION') {
    return application; // not in the right state — avoid double-processing
  }

  transition(application, 'INSPECTING_FORM', 'explicit prepare requested — starting form inspection');
  await application.save();

  await getInspectionQueue().add('inspect', { applicationId: application._id.toString() });
  return application;
}

// Stage 2b — 'prepare' job on the pipeline queue, enqueued by
// queue/processors/inspectionProcessor.js once form inspection completes.
// PREPARING -> resumeRouting -> answerAgent -> verifier -> READY_FOR_APPROVAL
async function runPreparation(applicationId) {
  const application = await Application.findById(applicationId);
  if (!application) throw new Error(`Application ${applicationId} not found`);
  if (application.status !== 'PREPARING') {
    return application; // already past this stage — avoid double-processing
  }

  const [job, profile, policy, pipelineConfig] = await Promise.all([
    Job.findById(application.jobId).lean(),
    getOrSeed(CandidateProfile, application.userId),
    getOrSeed(ApplicationPolicy, application.userId),
    getPipelineConfig(),
  ]);
  if (!job) throw new Error(`Job ${application.jobId} referenced by Application ${applicationId} not found`);

  const resumeVariants = await ResumeVariant.find({ userId: application.userId, isActive: true }).lean();
  const routing = await resumeRouting(job, resumeVariants);
  application.resumeVariantId = routing.resumeVariantId;

  const neverAnswerFields = new Set(policy.neverAnswerFields || []);
  // Fields with no discoverable label (form-inspector/inspect.js's
  // extractFields couldn't find a <label>, aria-label, placeholder, or name)
  // are typically hidden companion inputs Greenhouse/etc. generate alongside
  // a visible dropdown/select question — auto-populated by the page's own
  // JS when the visible counterpart is filled, not something a human or
  // this pipeline can meaningfully answer directly. Excluding them from
  // drafting keeps the review screen free of blank "" rows; the apply-
  // adapter still sees them via formInspection.fields (untouched here) in
  // case it ever needs to handle them at actual fill time.
  const answerableFields = (application.formInspection?.fields || [])
    .filter(f => !neverAnswerFields.has(f.key))
    .filter(f => !f.unresolvedLabel)
    .filter(f => f.label && f.label.trim().length > 0)
    // File-upload fields (resume/cover letter/etc) are never text-answered
    // — the actual attach happens separately, via resumeVariant.storageKey
    // in the apply-adapters (setInputFiles), independent of
    // application.answers entirely. Previously these went through the same
    // text-drafting path as everything else, came back "left blank — no
    // matching fact, 0% confidence" (correctly — there IS no text fact for
    // a file field), and showed up on the review screen looking like a
    // failure when the resume attach was actually working fine separately.
    .filter(f => f.fieldType !== 'file');

  const draftAnswers = await answerAgent(job, profile, answerableFields, policy);
  const verifiedAnswers = await verifier(draftAnswers, profile);
  application.answers = verifiedAnswers;

  application.confidenceTier = computeTier({
    answers: verifiedAnswers,
    alwaysManualFields: pipelineConfig.alwaysManualFields,
    requireManualFields: policy.requireManualFields,
    thresholds: pipelineConfig.confidenceThresholds,
  });

  transition(application, 'READY_FOR_APPROVAL', 'preparation complete');
  await application.save();

  return application;
}

module.exports = { runEvaluation, runPrepare, runPreparation };
