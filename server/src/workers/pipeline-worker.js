require('dotenv').config();
process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'pipeline-worker';
require('../utils/logger'); // patch console so these logs relay into the API's admin Terminal
const { Worker } = require('bullmq');
const { connect } = require('../utils/db');
const { getConnection } = require('../queue/connection');
const pipelineProcessor = require('../queue/processors/pipelineProcessor');
const { startHealthServer } = require('./healthServer');

const CONCURRENCY = Number(process.env.PIPELINE_CONCURRENCY) || 3;

// Runs ONLY non-browser LLM pipeline jobs (eligibility/fit/resume/answer/verifier).
// Zero Playwright here — deliberately isolated from workers/apply-worker.js so
// a browser memory spike/crash can never delay job evaluation, and vice versa.
async function start() {
  await connect();
  console.log('[pipeline-worker] MongoDB connected');
  // Render injects PORT per-service (each worker is its own Render "web"
  // service in production, so PORT there is already worker-specific and
  // safe to use). Locally, all processes share one .env with a single
  // PORT=5000 for the API — PIPELINE_WORKER_PORT lets this worker pick its
  // own port instead of colliding with the API or the other worker.
  startHealthServer('pipeline-worker', process.env.PIPELINE_WORKER_PORT || process.env.PORT || 10001);

  const worker = new Worker('pipeline', pipelineProcessor, {
    connection: getConnection(),
    concurrency: CONCURRENCY,
  });

  worker.on('completed', (job, result) => {
    console.log(`[pipeline-worker] job ${job.id} completed`, result);
  });
  worker.on('failed', (job, err) => {
    console.error(`[pipeline-worker] job ${job?.id} failed:`, err.message);
  });
  worker.on('error', (err) => {
    console.error('[pipeline-worker] worker error:', err.message);
  });
  worker.on('ready', () => {
    console.log('[pipeline-worker] BullMQ worker ready — consuming queue');
  });

  console.log(`[pipeline-worker] listening (concurrency=${CONCURRENCY})`);
  return worker;
}

if (require.main === module) {
  start().catch(e => { console.error('[pipeline-worker] fatal error', e); process.exit(1); });
}

module.exports = start;
