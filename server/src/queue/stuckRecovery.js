const { Application } = require('../models/application');
const { transition } = require('../utils/applicationState');

// Statuses a job leaves an Application in mid-processing — if the job that
// was supposed to move it onward dies for good (BullMQ exhausts its 3
// attempts), the Application was previously left frozen here forever: no
// queued job, no error recorded, invisible to both the admin retry route
// (which doesn't handle these statuses) and the user (who just sees it
// stuck with no explanation).
const IN_FLIGHT_STATUSES = ['EVALUATING', 'INSPECTING_FORM', 'PREPARING', 'APPLYING'];

// Called from each worker's `worker.on('failed', ...)` handler. Only acts
// once BullMQ has truly given up on the job (attemptsMade reached the
// configured attempts) — an earlier attempt failing is a normal, expected
// step in BullMQ's own retry flow, not a reason to touch the Application.
async function markStuckFailedOnFinalAttempt(job, err) {
  if (!job) return;
  const maxAttempts = job.opts?.attempts ?? 1;
  if (job.attemptsMade < maxAttempts) return; // more retries still queued

  const applicationId = job.data?.applicationId;
  if (!applicationId) return;

  try {
    const application = await Application.findById(applicationId);
    if (!application || !IN_FLIGHT_STATUSES.includes(application.status)) return;

    transition(application, 'FAILED', `job "${job.name}" exhausted all ${maxAttempts} attempts: ${err?.message || 'unknown error'}`);
    await application.save();
    console.error(`[stuckRecovery] marked Application ${applicationId} FAILED after job "${job.name}" exhausted retries`);
  } catch (recoveryErr) {
    // Never let a failure to mark-as-failed take down the worker process.
    console.error(`[stuckRecovery] could not mark Application ${applicationId} FAILED:`, recoveryErr.message);
  }
}

module.exports = { markStuckFailedOnFinalAttempt, IN_FLIGHT_STATUSES };
