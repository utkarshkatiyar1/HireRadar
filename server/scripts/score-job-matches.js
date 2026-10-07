// One-off / manual run of the background job-match scoring pass (normally
// runs automatically after each cron scrape — see src/cron.js). Use this to
// score existing jobs immediately without waiting for the next cron tick,
// e.g. right after deploying jobMatch scoring for the first time.
//   node scripts/score-job-matches.js
//
// Requires GEMINI_API_KEY and MONGO_URI (embedding calls + usage-limiter
// both need a real DB connection).
require('dotenv').config();
// Same DNS pin as src/cron.js — this environment's default resolver can't
// resolve the Mongo Atlas SRV record without it.
const dns = require('node:dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
const { connect } = require('../src/utils/db');
const { scoreUnscoredJobMatches } = require('../src/utils/jobMatchBatch');

(async () => {
  await connect();
  console.log('Connected. Scoring unscored (user, job) pairs...');
  const result = await scoreUnscoredJobMatches();
  console.log('Done:', result);
  process.exit(0);
})().catch(e => {
  console.error('score-job-matches failed:', e);
  process.exit(1);
});
