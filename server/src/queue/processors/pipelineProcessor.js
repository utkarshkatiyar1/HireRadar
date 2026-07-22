const { runEvaluation, runPrepare, runPreparation } = require('../../agents/pipeline');

// BullMQ job processor for the 'pipeline' queue. job.data: { applicationId }
// job.name distinguishes the three hand-off points:
//   'evaluate'      -> runEvaluation (DISCOVERED..READY_FOR_PREPARATION — a
//                       recommendation; stops here automatically)
//   'prepareTrigger' -> runPrepare (READY_FOR_PREPARATION->INSPECTING_FORM,
//                       enqueued ONLY by POST /applications/:id/prepare)
//   'prepare'        -> runPreparation (PREPARING..READY_FOR_APPROVAL),
//                       enqueued by queue/processors/inspectionProcessor.js
//                       once inspection completes
const RUNNERS = {
  prepareTrigger: runPrepare,
  prepare: runPreparation,
};

module.exports = async function pipelineProcessor(job) {
  const { applicationId } = job.data;
  const runner = RUNNERS[job.name] || runEvaluation;
  const application = await runner(applicationId);
  return { applicationId, status: application.status };
};
