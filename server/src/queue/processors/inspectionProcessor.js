const { Job } = require('../../utils/db');
const { Application } = require('../../models/application');
const { transition } = require('../../utils/applicationState');
const inspect = require('../../form-inspector/inspect');
const { getPipelineQueue } = require('../queues');

// BullMQ job processor for the 'inspection' queue. job.data: { applicationId }
// Runs on the apply-worker (real browser, no submission) — writes
// formInspection + applicationPlatform onto the Application, then hands back
// to the pipeline-worker to continue with answer generation, UNLESS the
// platform can't be automated at all, in which case it short-circuits
// straight to READY_FOR_APPROVAL with a manual-only tier and skips answer
// generation entirely (per the plan: no answers to draft if nothing can be
// filled in).
module.exports = async function inspectionProcessor(job) {
  const { applicationId } = job.data;
  const application = await Application.findById(applicationId);
  if (!application) throw new Error(`Application ${applicationId} not found`);
  if (application.status !== 'INSPECTING_FORM') {
    return { applicationId, status: application.status, note: 'already past inspection, skipped' };
  }

  const jobDoc = await Job.findById(application.jobId).lean();
  if (!jobDoc) throw new Error(`Job ${application.jobId} not found`);

  const result = await inspect(jobDoc.url);
  application.formInspection = result;
  application.applicationPlatform = result.platform;

  if (result.expired) {
    // The scraped URL redirected to a generic "no longer open" listing page
    // (discovered via live testing — a job can go stale between scrape time
    // and prepare time). This must never reach READY_FOR_APPROVAL implying
    // it's still applyable.
    transition(application, 'EXPIRED', 'job posting is no longer open (detected during form inspection)');
    await application.save();
    return { applicationId, status: application.status, expired: true };
  }

  if (result.automationCapability === 'NONE') {
    // Clear any answers from a PRIOR prepare/reinspect cycle — a real
    // incident: reinspecting an application that previously had a bad field
    // (e.g. a mis-extracted site-search widget) landed here with a fresh,
    // correctly-empty formInspection.fields, but the OLD application.answers
    // array from the earlier cycle was never touched, so the review screen
    // kept showing the stale bad answer even though inspection had just
    // proven the form itself has nothing to draft against.
    application.answers = [];
    application.confidenceTier = 'MANUAL';
    transition(application, 'READY_FOR_APPROVAL', 'form cannot be automated — manual-only, skipping answer generation');
    await application.save();
    return { applicationId, status: application.status, automationCapability: 'NONE' };
  }

  transition(application, 'PREPARING', 'form inspected, entering preparation');
  await application.save();

  await getPipelineQueue().add('prepare', { applicationId });
  return { applicationId, status: application.status, automationCapability: result.automationCapability };
};
