const { Queue } = require('bullmq');
const { getConnection } = require('./connection');

// pipelineQueue: non-browser LLM agent stages (eligibility/fit/resume/answer/verifier).
//   Consumed by workers/pipeline-worker.js.
// inspectionQueue: Playwright form-inspection (opens a real browser, no submission).
//   Consumed by workers/apply-worker.js — deliberately grouped with applyQueue,
//   NOT pipelineQueue, since both open a browser and must share that isolation.
// applyQueue: Playwright submission jobs.
//   Consumed by workers/apply-worker.js.
let pipelineQueue, inspectionQueue, applyQueue;

// Completed/failed jobs otherwise stay in Redis forever (BullMQ default),
// each held job costing ongoing command overhead (getJobCounts, cleanup
// scans, etc.) against Upstash's metered command quota. Capped retention
// still leaves enough history for /admin/queues and debugging without
// piling up thousands of jobs from bulk operations like requeue-stuck.
const defaultJobOptions = {
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 1000 },
  // No retry previously meant a single transient failure (Playwright crash,
  // network blip, Mongo hiccup) left a job dead with no automatic recovery —
  // the application just sat wherever it was mid-transition until a human
  // noticed and hit the admin retry route. 3 attempts with exponential
  // backoff absorbs the transient case; a genuinely broken job still ends up
  // FAILED/SUBMISSION_UNCONFIRMED for a human, same as before.
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
};

const getPipelineQueue = () => {
  if (!pipelineQueue) pipelineQueue = new Queue('pipeline', { connection: getConnection(), defaultJobOptions });
  return pipelineQueue;
};

const getInspectionQueue = () => {
  if (!inspectionQueue) inspectionQueue = new Queue('inspection', { connection: getConnection(), defaultJobOptions });
  return inspectionQueue;
};

const getApplyQueue = () => {
  if (!applyQueue) applyQueue = new Queue('apply', { connection: getConnection(), defaultJobOptions });
  return applyQueue;
};

module.exports = { getPipelineQueue, getInspectionQueue, getApplyQueue };
