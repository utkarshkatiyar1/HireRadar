// One-off catch-up scoring for a single user by email — for when the
// general multi-user batch (scripts/score-job-matches.js) would take many
// runs to clear a large backlog and only one user needs results right now.
//   node scripts/score-job-matches-for-user.js someone@example.com
//   node scripts/score-job-matches-for-user.js someone@example.com --force  (re-score already-scored jobs too)
//   node scripts/score-job-matches-for-user.js someone@example.com --retry-nulls
//     (re-score only jobs that have a real description but semanticScore
//     still null — i.e. jobs where the embedding call itself failed/hit
//     quota last time, not jobs with no description to embed in the first
//     place. Use LLM_EMBEDDING_MODEL=<alt model> to retry against a
//     different embedding model/quota pool than what originally failed.)
//
// Requires GEMINI_API_KEY and MONGO_URI.
require('dotenv').config();
const dns = require('node:dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
const { connect, Job, User, UserJobState } = require('../src/utils/db');
const CandidateProfile = require('../src/models/candidateProfile');
const { computeJobMatchScore, EMBEDDING_MODEL } = require('../src/utils/jobMatch');

const RECENCY_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;

// Circuit breaker: if the first CHECK_AFTER attempts all come back with
// semanticScore:null, something is broken (wrong model name, bad API key,
// provider outage) rather than "occasionally hits quota" — abort instead of
// burning the rest of the run on a silent failure that looks identical to
// success in the scored/errors counters.
const CHECK_AFTER = 20;

(async () => {
  const email = process.argv[2];
  const force = process.argv.includes('--force');
  const retryNulls = process.argv.includes('--retry-nulls');
  if (!email) {
    console.error('Usage: node scripts/score-job-matches-for-user.js <email> [--force | --retry-nulls]');
    process.exit(1);
  }

  await connect();
  console.log(`Using embedding model: ${EMBEDDING_MODEL}`);

  const user = await User.findOne({ email: email.toLowerCase().trim() }).lean();
  if (!user) {
    console.error(`No user found for ${email}`);
    process.exit(1);
  }

  const profile = await CandidateProfile.findOne({ userId: user._id }).lean();
  if (!profile) {
    console.error(`No CandidateProfile found for ${email} — nothing to score against`);
    process.exit(1);
  }

  const cutoff = new Date(Date.now() - RECENCY_WINDOW_MS);
  let jobs;
  if (retryNulls) {
    const nullSemanticJobIds = await UserJobState.find(
      { userId: user._id, 'matchScore.computedAt': { $exists: true }, 'matchScore.semanticScore': null },
      { jobId: 1 }
    ).lean().then(rows => rows.map(r => r.jobId));
    jobs = await Job.find({
      _id: { $in: nullSemanticJobIds },
      description: { $exists: true, $ne: '', $ne: null },
    }).lean();
    console.log(`--retry-nulls: re-embedding ${jobs.length} jobs that have a description but no semantic score yet`);
  } else if (force) {
    jobs = await Job.find({ date: { $gte: cutoff } }).lean();
    console.log(`--force: re-scoring ALL ${jobs.length} recent jobs for ${email} (ignoring existing matchScore)`);
  } else {
    const scoredJobIds = await UserJobState.find(
      { userId: user._id, 'matchScore.computedAt': { $exists: true } },
      { jobId: 1 }
    ).lean().then(rows => rows.map(r => r.jobId));
    jobs = await Job.find({ date: { $gte: cutoff }, _id: { $nin: scoredJobIds } }).lean();
    console.log(`Scoring ${jobs.length} unscored jobs for ${email}...`);
  }

  let scored = 0, errors = 0, withSemanticScore = 0;
  for (const job of jobs) {
    try {
      const { total, keywordScore, semanticScore } = await computeJobMatchScore(job, profile);
      await UserJobState.findOneAndUpdate(
        { userId: user._id, jobId: job._id },
        { $set: { matchScore: { total, keywordScore, semanticScore, computedAt: new Date() } } },
        { upsert: true }
      );
      scored++;
      if (semanticScore != null) withSemanticScore++;

      if (scored === CHECK_AFTER && withSemanticScore === 0) {
        console.error(
          `\nABORTING: 0/${CHECK_AFTER} scored jobs got a real semantic score — ` +
          `embedding calls are failing silently (wrong model name, bad key, or provider ` +
          `outage), not just hitting quota. Check the embedding call directly before ` +
          `re-running this script, or you'll burn the rest of the batch on the same failure.`
        );
        process.exit(1);
      }
      if (scored % 200 === 0) console.log(`  ...${scored}/${jobs.length} (${withSemanticScore} with real semantic score)`);
    } catch (err) {
      console.error(`  failed on job ${job._id}:`, err.message);
      errors++;
    }
  }

  console.log(`Done. scored=${scored} errors=${errors} withSemanticScore=${withSemanticScore}`);
  process.exit(0);
})().catch(e => {
  console.error('score-job-matches-for-user failed:', e);
  process.exit(1);
});
