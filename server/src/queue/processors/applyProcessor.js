const { Job } = require('../../utils/db');
const { Application } = require('../../models/application');
const ResumeVariant = require('../../models/resumeVariant');
const PipelineConfig = require('../../models/pipelineConfig');
const { transition } = require('../../utils/applicationState');
const { shouldSkipSubmission } = require('../../apply-adapters/shared');

const ADAPTERS = {
  GREENHOUSE: () => require('../../apply-adapters/greenhouse'),
  LEVER:      () => require('../../apply-adapters/lever'),
  ASHBY:      () => require('../../apply-adapters/ashby'),
};

// BullMQ job processor for the 'apply' queue. job.data: { applicationId }
// Dispatches to the platform-specific adapter (greenhouse/lever/ashby),
// applies the multi-signal idempotency check BEFORE launching a browser at
// all (cheapest place to short-circuit a double-submit), and maps the
// adapter's outcome onto the Application state machine.
module.exports = async function applyProcessor(job) {
  const { applicationId } = job.data;
  const application = await Application.findById(applicationId);
  if (!application) throw new Error(`Application ${applicationId} not found`);

  const skipCheck = shouldSkipSubmission(application);
  if (skipCheck.skip) {
    return { applicationId, status: application.status, skipped: true, reason: skipCheck.reason };
  }

  if (application.status !== 'APPLYING') {
    return { applicationId, status: application.status, note: 'not in APPLYING state, skipped' };
  }

  const loadAdapter = ADAPTERS[application.applicationPlatform];
  if (!loadAdapter) {
    transition(application, 'SUBMISSION_BLOCKED', `no apply-adapter available for platform "${application.applicationPlatform}"`);
    await application.save();
    return { applicationId, status: application.status };
  }

  const [job_, resumeVariant, pipelineConfig] = await Promise.all([
    Job.findById(application.jobId).lean(),
    application.resumeVariantId ? ResumeVariant.findById(application.resumeVariantId).lean() : null,
    PipelineConfig.findOne({ key: 'default' }).lean(),
  ]);
  if (!job_) throw new Error(`Job ${application.jobId} referenced by Application ${applicationId} not found`);

  const platformKey = application.applicationPlatform.toLowerCase();
  const allowed = pipelineConfig?.allowAutoSubmit?.[platformKey];
  if (process.env.APPLY_DRY_RUN === 'false' && !allowed) {
    // Live-submit is only permitted when this exact platform is explicitly
    // enabled — dry-run is unaffected by this check (dry-run always runs).
    transition(application, 'SUBMISSION_BLOCKED', `live submission for "${application.applicationPlatform}" is not enabled in PipelineConfig.allowAutoSubmit`);
    await application.save();
    return { applicationId, status: application.status };
  }

  const submitFn = loadAdapter();
  const result = await submitFn({ application, job: job_, resumeVariant });

  application.auditLog.push({ action: `apply:${result.outcome}`, detail: { fillResults: result.fillResults }, screenshotRef: result.screenshotRef });

  switch (result.outcome) {
    case 'DRY_RUN_COMPLETED':
      transition(application, 'DRY_RUN_COMPLETED', 'dry-run submission stopped before final submit');
      break;
    case 'SUBMITTED':
      application.confirmation = result.confirmation;
      application.appliedAt = new Date();
      application.applied = true;
      transition(application, 'SUBMITTED', 'submission confirmed via two independent signals');
      break;
    case 'SUBMISSION_UNCONFIRMED':
      application.confirmation = result.confirmation;
      transition(application, 'SUBMISSION_UNCONFIRMED', 'submit clicked but confirmation could not be verified — requires manual reconciliation, will not auto-retry');
      break;
    case 'ACTION_REQUIRED':
      application.pendingQuestion = { ...result.pendingQuestion, createdAt: new Date() };
      transition(application, 'ACTION_REQUIRED', 'paused for human input (OTP/CAPTCHA/login)');
      break;
    case 'SKIPPED':
      // shouldSkipSubmission already caught this above; adapter-level guard is defense in depth.
      break;
    default:
      transition(application, 'FAILED', `unrecognized apply-adapter outcome: ${result.outcome}`);
  }

  await application.save();
  return { applicationId, status: application.status, outcome: result.outcome };
};
