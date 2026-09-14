require('dotenv').config();
process.env.SERVICE_NAME = process.env.SERVICE_NAME || 'apply-worker';
require('../utils/logger'); // patch console so these logs relay into the API's admin Terminal
require('node:dns').setServers(['1.1.1.1', '8.8.8.8']);
const { Worker } = require('bullmq');
const { connect } = require('../utils/db');
const { getConnection } = require('../queue/connection');
const applyProcessor      = require('../queue/processors/applyProcessor');
const inspectionProcessor = require('../queue/processors/inspectionProcessor');
const { startHealthServer } = require('./healthServer');
const { markStuckFailedOnFinalAttempt } = require('../queue/stuckRecovery');

const APPLY_CONCURRENCY      = Number(process.env.APPLY_CONCURRENCY) || 1;
const INSPECTION_CONCURRENCY = Number(process.env.INSPECTION_CONCURRENCY) || 2;

// Runs ALL Playwright-based work: form-inspection (inspectionQueue) AND
// apply-adapter submission (applyQueue). Both open a real browser, so they
// belong together and stay isolated from workers/pipeline-worker.js, which
// must never be starved by browser memory/CPU spikes.
async function start() {
  await connect();
  console.log('[apply-worker] MongoDB connected');
  // See pipeline-worker.js's equivalent comment — Render's per-service PORT
  // is safe to use in production; APPLY_WORKER_PORT disambiguates locally
  // where one shared .env sets PORT=5000 for the API.
  startHealthServer('apply-worker', process.env.APPLY_WORKER_PORT || process.env.PORT || 10002);

  // stalledInterval widened from BullMQ's 30s default — that's a continuous
  // background poll per Worker regardless of actual load, pure Redis command
  // overhead at low volume. 120s means a genuinely crashed job takes up to
  // ~2 min longer to be detected/retried, an acceptable trade at this scale.
  const applyWorker = new Worker('apply', applyProcessor, {
    connection: getConnection(),
    concurrency: APPLY_CONCURRENCY,
    stalledInterval: 120_000,
  });
  const inspectionWorker = new Worker('inspection', inspectionProcessor, {
    connection: getConnection(),
    concurrency: INSPECTION_CONCURRENCY,
    stalledInterval: 120_000,
  });

  for (const [name, worker] of [['apply', applyWorker], ['inspection', inspectionWorker]]) {
    worker.on('completed', (job, result) => {
      console.log(`[apply-worker:${name}] job ${job.id} completed`, result);
    });
    worker.on('failed', (job, err) => {
      console.error(`[apply-worker:${name}] job ${job?.id} failed:`, err.message);
      markStuckFailedOnFinalAttempt(job, err);
    });
    worker.on('error', (err) => {
      console.error(`[apply-worker:${name}] worker error:`, err.message);
    });
    worker.on('ready', () => {
      console.log(`[apply-worker:${name}] BullMQ worker ready — consuming queue`);
    });
  }

  console.log(`[apply-worker] listening (apply concurrency=${APPLY_CONCURRENCY}, inspection concurrency=${INSPECTION_CONCURRENCY})`);
  return { applyWorker, inspectionWorker };
}

if (require.main === module) {
  start().catch(e => { console.error('[apply-worker] fatal error', e); process.exit(1); });
}

module.exports = start;
