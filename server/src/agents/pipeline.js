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
  if (application.status !== 'DISCOVERED') {
    return application; // already past this stage — avoid double-processing
  }

  const [job, profile, policy] = await Promise.all([
    Job.findById(application.jobId).lean(),
    getOrSeed(CandidateProfile, application.userId),
    getOrSeed(ApplicationPolicy, application.userId),
  ]);
  if (!job) throw new Error(`Job ${application.jobId} referenced by Application ${applicationId} not found`);

  application.discoverySourceType = job.sourceType || job.ats || 'UNKNOWN';

  transition(application, 'EVALUATING', 'pipeline started');
  await application.save();

  const eligResult = await eligibility(application, job, profile, policy);
  application.eligibility = {
    passed: eligResult.passed, reasons: eligResult.reasons, checkedAt: new Date(),
    llmStatus: eligResult.llmStatus,
  };

  if (!eligResult.passed) {
    transition(application, 'REJECTED', eligResult.reasons?.join('; ') || 'failed eligibility');
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
  const answerableFields = (application.formInspection?.fields || []).filter(f => !neverAnswerFields.has(f.key));

  const draftAnswers = await answerAgent(job, profile, answerableFields);
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
