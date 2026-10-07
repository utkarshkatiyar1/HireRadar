require('dotenv').config();
require('./utils/logger'); // patch console first
const express = require('express');
const cors    = require('cors');
const cron    = require('node-cron');
const { connect, Job, UserJobState } = require('./utils/db');
const { scoreUnscoredJobMatches } = require('./utils/jobMatchBatch');
const jobsRouter             = require('./routes/jobs');
const authRouter             = require('./routes/auth');
const adminRouter            = require('./routes/admin');
const profileRouter          = require('./routes/profile');
const profileCandidateRouter = require('./routes/profile-candidate');
const resumesRouter          = require('./routes/resumes');
const applicationsRouter     = require('./routes/applications');
const scrape      = require('./index');

const dns = require("node:dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);

// Render's free tier caps the whole workspace at 750 instance-hours/month,
// shared across every service kept alive (UptimeRobot pings all 3 every 5
// min specifically to stop them spinning down, so 3 separate always-on
// services blow well past that combined). Merging the two BullMQ workers
// into this same process/service cuts that back down to one. Trade-off:
// apply-worker's Playwright/Chromium is the heaviest, crash-proneist thing
// in this codebase, and it's no longer isolated from the Express API — a
// browser OOM/crash can now take the whole process down, not just
// job-application processing. Acceptable for now (solo user, APPLY_DRY_RUN
// on, Render auto-restarts a crashed process) — revisit if usage grows.
const startPipelineWorker = require('./workers/pipeline-worker');
const startApplyWorker    = require('./workers/apply-worker');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/auth', authRouter);
app.use('/jobs', jobsRouter);
app.use('/admin', adminRouter);
app.use('/profile', profileRouter);
app.use('/profile', profileCandidateRouter);
app.use('/resumes', resumesRouter);
app.use('/applications', applicationsRouter);

// Health check — UptimeRobot pings this to keep Render awake
app.get('/health', (_req, res) => res.json({ ok: true }));

(async () => {
  await connect();
  console.log('MongoDB connected');
  // Ensure indexes exist on the live collection (no-op if already built)
  await Promise.all([Job.syncIndexes(), UserJobState.syncIndexes()]);
  console.log('Indexes synced');
  app.listen(PORT, () => console.log(`API  → http://localhost:${PORT}/jobs`));

  cron.schedule('0 */2 * * *', async () => {
    console.log(`[CRON] ${new Date().toISOString()} — starting scrape`);
    await scrape();
    console.log(`[CRON] ${new Date().toISOString()} — scoring job matches`);
    const result = await scoreUnscoredJobMatches().catch(e => {
      // Scoring failure shouldn't be treated as a cron failure — /jobs still
      // works fine on the recency+keyword fallback for unscored jobs.
      console.error('[CRON] job-match scoring failed', e);
      return null;
    });
    if (result) console.log(`[CRON] job-match scoring: ${JSON.stringify(result)}`);
  });

  console.log('Cron scheduled — every 2 hours');

  // Each worker's own healthServer binds PIPELINE_WORKER_PORT/APPLY_WORKER_PORT
  // (distinct from this service's own PORT) — set those in this service's env
  // so all three HTTP listeners don't collide on the same port.
  await Promise.all([startPipelineWorker(), startApplyWorker()]);
  console.log('Pipeline worker and apply worker started in-process');
})().catch(e => { console.error('[cron] fatal startup error', e); process.exit(1); });
