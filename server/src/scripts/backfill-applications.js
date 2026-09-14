// One-off migration: upserts an Application doc for every existing UserJobState
// row, so the new richer state machine has a starting point without touching
// or deleting UserJobState (routes/jobs.js and routes/profile.js keep reading
// it untouched — this is additive, not a replacement).
//
// Run with: node src/scripts/backfill-applications.js
require('dotenv').config();
const { connect, UserJobState } = require('../utils/db');
const { Application } = require('../models/application');

const run = async () => {
  await connect();

  const states = await UserJobState.find({}).lean();
  console.log(`[backfill] found ${states.length} UserJobState rows`);

  let created = 0, skipped = 0, failed = 0;

  for (const s of states) {
    const status = s.applied ? 'SUBMITTED' : (s.dismissed ? 'SKIPPED' : 'DISCOVERED');
    try {
      const existing = await Application.findOne({ userId: s.userId, jobId: s.jobId }).lean();
      if (existing) { skipped++; continue; }

      await Application.create({
        userId: s.userId,
        jobId: s.jobId,
        status,
        statusHistory: [{ status, at: s.appliedAt || s.createdAt || new Date(), note: 'backfilled from UserJobState' }],
        applied: !!s.applied,
        appliedAt: s.appliedAt,
        dismissed: !!s.dismissed,
      });
      created++;
    } catch (e) {
      failed++;
      console.error(`[backfill] failed for userId=${s.userId} jobId=${s.jobId}:`, e.message);
    }
  }

  console.log(`[backfill] done — created: ${created}, already existed: ${skipped}, failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
};

if (require.main === module) {
  run().catch(e => { console.error('[backfill] fatal error', e); process.exit(1); });
}

module.exports = run;
