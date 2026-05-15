// One-shot: copy legacy Job.applied / Job.dismissed flags into UserJobState for a given user.
// Usage:  node src/scripts/backfill.js you@example.com

require('dotenv').config();
const { connect, Job, User, UserJobState } = require('../utils/db');

(async () => {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email) {
    console.error('Usage: node src/scripts/backfill.js <email>');
    process.exit(1);
  }

  await connect();

  const user = await User.findOne({ email });
  if (!user) {
    console.error(`No user with email ${email}. Sign up first via the UI.`);
    process.exit(1);
  }

  const legacy = await Job.find({
    $or: [{ applied: true }, { dismissed: true }],
  }).lean();

  console.log(`Found ${legacy.length} legacy jobs to backfill for ${email} (${user._id})`);

  let upserts = 0;
  const ops = legacy.map(j => {
    upserts++;
    return {
      updateOne: {
        filter: { userId: user._id, jobId: j._id },
        update: {
          $set: {
            applied:   !!j.applied,
            appliedAt: j.applied ? (j.appliedAt || j.updatedAt || new Date()) : null,
            dismissed: !!j.dismissed,
          },
        },
        upsert: true,
      },
    };
  });

  if (ops.length) {
    const result = await UserJobState.bulkWrite(ops, { ordered: false });
    console.log(`Backfill done. attempted=${upserts} upserted=${result.upsertedCount} modified=${result.modifiedCount}`);
  } else {
    console.log('Nothing to backfill.');
  }

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
