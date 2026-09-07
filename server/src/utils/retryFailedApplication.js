const { transition } = require('./applicationState');
const { getPipelineQueue, getApplyQueue } = require('../queue/queues');

// Resumes a FAILED application at the right stage — FAILED can be reached
// from EVALUATING, INSPECTING_FORM, PREPARING, or APPLYING (see
// queue/stuckRecovery.js and queue/processors/applyProcessor.js's
// unrecognized-outcome case), and always restarting from EVALUATING would
// either waste work (redoing an already-passed eligibility/fit check) or,
// for an APPLYING-stage failure, silently no-op the re-added apply job
// (applyProcessor's guard requires status === 'APPLYING', which a reset to
// EVALUATING never satisfies).
//
// Assumes application.status === 'FAILED' and mutates + saves it.
async function retryFailedApplication(application, { note = 'retry' } = {}) {
  const priorStatus = application.statusHistory[application.statusHistory.length - 2]?.status;

  if (priorStatus === 'APPLYING') {
    transition(application, 'APPLYING', `${note} — resuming submission`);
    await application.save();
    await getApplyQueue().add('submit', { applicationId: application._id.toString(), retried: true });
  } else if (priorStatus === 'INSPECTING_FORM' || priorStatus === 'PREPARING') {
    // Restarting from READY_FOR_PREPARATION re-runs inspection+drafting from
    // scratch via the normal runPrepare flow — safe because neither stage
    // persists partial progress (see agents/pipeline.js).
    transition(application, 'READY_FOR_PREPARATION', `${note} — restarting form preparation`);
    await application.save();
    await getPipelineQueue().add('prepareTrigger', { applicationId: application._id.toString(), retried: true });
  } else {
    transition(application, 'EVALUATING', note);
    await application.save();
    await getPipelineQueue().add('evaluate', { applicationId: application._id.toString(), retried: true });
  }
}

module.exports = { retryFailedApplication };
