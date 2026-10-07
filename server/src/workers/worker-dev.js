// Local-dev convenience only: boots both workers in one process so a solo
// dev doesn't need to juggle 3 terminals while building. Production runs
// pipeline-worker.js and apply-worker.js as separate processes/services —
// see the Architecture section of the implementation plan for why.
require('dotenv').config();

const startPipelineWorker = require('./pipeline-worker');
const startApplyWorker    = require('./apply-worker');

(async () => {
  await Promise.all([startPipelineWorker(), startApplyWorker()]);
  console.log('[worker-dev] both pipeline-worker and apply-worker running in this process');
})().catch(e => { console.error('[worker-dev] fatal error', e); process.exit(1); });
