const { Job } = require('../../utils/db');
const { Application } = require('../../models/application');
const ResumeVariant = require('../../models/resumeVariant');
const PipelineConfig = require('../../models/pipelineConfig');
const { transition } = require('../../utils/applicationState');
const { shouldSkipSubmission } = require('../../apply-adapters/shared');

const ADAPTERS = {
  GREENHOUSE:     () => require('../../apply-adapters/greenhouse'),
  LEVER:          () => require('../../apply-adapters/lever'),
  ASHBY:          () => require('../../apply-adapters/ashby'),
  WORKDAY:        () => require('../../apply-adapters/workday'),
  SMARTRECRUITERS: () => require('../../apply-adapters/smartrecruiters'),
  EIGHTFOLD:      () => require('../../apply-adapters/eightfold'),
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
    // A prior attempt on this application already clicked submit (see
    // apply-adapters/shared.js's submitAttemptedAt) and the outcome was
    // never persisted — most likely a worker crash between the click and
    // this job's application.save(). Land it in SUBMISSION_UNCONFIRMED for
    // manual reconciliation rather than leaving it stuck in APPLYING or,
    // worse, letting a BullMQ retry launch a fresh browser and click submit
    // again on the real ATS form.
    if (application.status === 'APPLYING' && application.submitAttemptedAt && !application.confirmation?.detected) {
      transition(application, 'SUBMISSION_UNCONFIRMED', skipCheck.reason);
      await application.save();
    }
    return { applicationId, status: application.status, skipped: true, reason: skipCheck.reason };
  }

  if (application.status !== 'APPLYING') {
    return { applicationId, status: application.status, note: 'not in APPLYING state, skipped' };
  }

  // A NONE-automationCapability form has zero extracted fields and was never
  // meant to reach real submission — inspectionProcessor.js routes it
  // straight to READY_FOR_APPROVAL/MANUAL specifically so a human applies by
  // hand. Nothing previously stopped an "Approve & Submit" click from
  // reaching this far anyway: a real incident had exactly this launch a
  // browser, find no fillable fields, and hang 30s on a submit button it
  // should never have attempted to click.
  if (application.formInspection?.automationCapability === 'NONE') {
    transition(application, 'SUBMISSION_BLOCKED', 'form has no automatable fields (automationCapability: NONE) — apply manually on the job posting');
    await application.save();
    return { applicationId, status: application.status };
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

  // maxApplicationsPerDayGlobal existed in PipelineConfig's schema and the
  // admin UI as a settable knob but nothing ever read it — there was no
  // actual cap on daily submission volume anywhere. Only counts real,
  // confirmed SUBMITTED applications (not dry-runs) toward the cap, and only
  // blocks when live submission is actually in effect — a dry run's whole
  // point is to be free to run repeatedly without affecting real quota.
  if (process.env.APPLY_DRY_RUN === 'false') {
    const cap = pipelineConfig?.maxApplicationsPerDayGlobal;
    if (cap != null) {
      const day0 = new Date(); day0.setUTCHours(0, 0, 0, 0);
      const submittedToday = await Application.countDocuments({
        userId: application.userId, status: 'SUBMITTED', appliedAt: { $gte: day0 },
      });
      if (submittedToday >= cap) {
        transition(application, 'SUBMISSION_BLOCKED', `daily submission cap reached (${submittedToday}/${cap} — PipelineConfig.maxApplicationsPerDayGlobal)`);
        await application.save();
        return { applicationId, status: application.status };
      }
    }
  }

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
