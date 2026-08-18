// One-off repair: src/scripts/backfill-applications.js created Application
// docs via Application.create() directly (bypassing utils/applicationState.js's
// transition()), so lastStatusChangeAt got Mongoose's schema default
// (Date.now at insert time — the backfill run's wall-clock, 2026-07-21) baked
// in instead of the real historical timestamp already sitting in
// statusHistory[0].at. The existing repair route
// (POST /admin/applications/backfill-last-status-change) can never catch
// this — it only targets docs where the field is *missing*, and these have
// it present, just wrong.
//
// Identifies affected docs precisely via the exact marker backfill-applications.js
// wrote: a single-entry statusHistory with note === 'backfilled from UserJobState'.
//
//   node scripts/fix-backfilled-application-timestamps.js          (dry run — reports only)
//   node scripts/fix-backfilled-application-timestamps.js --apply  (writes the fix)
require('dotenv').config();
const dns = require('node:dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
const { connect } = require('../src/utils/db');
const { Application } = require('../src/models/application');

(async () => {
  const apply = process.argv.includes('--apply');
  await connect();

  const targets = await Application.find({
    'statusHistory.0.note': 'backfilled from UserJobState',
    statusHistory: { $size: 1 },
  }, { statusHistory: 1, lastStatusChangeAt: 1, createdAt: 1 }).lean();

  console.log(`Found ${targets.length} backfill-marker Application(s).`);

  const needsFix = targets.filter(a => {
    const realAt = a.statusHistory[0].at;
    return !a.lastStatusChangeAt || Math.abs(new Date(a.lastStatusChangeAt) - new Date(realAt)) > 1000;
  });
  console.log(`  of which ${needsFix.length} have lastStatusChangeAt diverged from statusHistory[0].at.`);

  if (!apply) {
    console.log('Dry run — no writes. Re-run with --apply to fix.');
    console.log('Sample:', needsFix.slice(0, 3).map(a => ({
      id: a._id, lastStatusChangeAt: a.lastStatusChangeAt, realAt: a.statusHistory[0].at,
    })));
    process.exit(0);
  }

  const bulkOps = needsFix.map(a => ({
    updateOne: {
      filter: { _id: a._id },
      update: { $set: { lastStatusChangeAt: a.statusHistory[0].at } },
    },
  }));
  if (bulkOps.length) {
    const result = await Application.bulkWrite(bulkOps, { ordered: false });
    console.log('Fixed:', result.modifiedCount);
  } else {
    console.log('Nothing to fix.');
  }
  process.exit(0);
})().catch(e => { console.error('fix-backfilled-application-timestamps failed:', e); process.exit(1); });
