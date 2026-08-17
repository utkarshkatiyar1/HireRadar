// One-off backfill: populates Job.description on EXISTING job documents for
// the four ATS platforms whose scrapers were just updated to capture JD text
// (see src/scrapers/ats/{greenhouse,lever,ashby,zohorecruit}.js).
//
// Why this is needed instead of just re-running the normal scrape: the
// normal upsert in src/index.js uses `$setOnInsert` for job fields, which
// only applies when a NEW document is created. Every job already in the DB
// was inserted before this fix, so a plain scrape() would never backfill
// `description` onto them — it would just re-confirm the same URLs and skip
// the insert branch entirely. This script re-fetches each source directly
// and updates existing docs by `url` instead.
//
//   node scripts/backfill-job-descriptions.js
//
// Requires MONGO_URI. Does not touch Gemini/LLM quota — this is pure
// scrape+DB-write, no embedding calls.
require('dotenv').config();
const dns = require('node:dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
const { connect, Job, Source } = require('../src/utils/db');
const { DEFAULTS } = require('../src/config/sources');

const SUPPORTED_ATS = ['greenhouse', 'lever', 'ashby', 'zohorecruit'];

(async () => {
  await connect();

  const sources = await Source.find({ enabled: true, ats: { $in: SUPPORTED_ATS } })
    .lean()
    .then(docs => docs.map(s => ({ ...DEFAULTS, ...s })));

  console.log(`Backfilling descriptions for ${sources.length} sources across ${SUPPORTED_ATS.join(', ')}...`);

  let totalUpdated = 0, totalSkippedNoDesc = 0, sourcesFailed = 0;

  for (const src of sources) {
    const scraper = require(`../src/scrapers/ats/${src.ats}`);
    let jobs;
    try {
      jobs = await scraper(src);
    } catch (err) {
      console.error(`  [${src.company}] scrape failed: ${err.message}`);
      sourcesFailed++;
      continue;
    }

    const withDescription = jobs.filter(j => j.description && j.url);
    if (!withDescription.length) {
      totalSkippedNoDesc += jobs.length;
      continue;
    }

    const ops = withDescription.map(j => ({
      updateOne: {
        filter: { url: j.url },
        update: { $set: { description: j.description } },
      },
    }));

    const result = await Job.bulkWrite(ops, { ordered: false });
    const updated = result.modifiedCount ?? 0;
    totalUpdated += updated;
    console.log(`  [${src.company}] ${updated}/${jobs.length} jobs updated with description`);
  }

  console.log(`\nDone. totalUpdated=${totalUpdated} totalSkippedNoDesc=${totalSkippedNoDesc} sourcesFailed=${sourcesFailed}`);
  process.exit(0);
})().catch(e => {
  console.error('backfill-job-descriptions failed:', e);
  process.exit(1);
});
