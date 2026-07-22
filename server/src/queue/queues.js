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

const getPipelineQueue = () => {
  if (!pipelineQueue) pipelineQueue = new Queue('pipeline', { connection: getConnection() });
  return pipelineQueue;
};

const getInspectionQueue = () => {
  if (!inspectionQueue) inspectionQueue = new Queue('inspection', { connection: getConnection() });
  return inspectionQueue;
};

const getApplyQueue = () => {
  if (!applyQueue) applyQueue = new Queue('apply', { connection: getConnection() });
  return applyQueue;
};

module.exports = { getPipelineQueue, getInspectionQueue, getApplyQueue };
