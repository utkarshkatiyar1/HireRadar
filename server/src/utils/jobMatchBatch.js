const { Job, User, UserJobState } = require('./db');
const CandidateProfile = require('../models/candidateProfile');
const { computeJobMatchScore } = require('./jobMatch');

// Same 15-day recency window routes/jobs.js queries by — no point scoring
// jobs that route will never return.
const RECENCY_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;

// No per-run pair cap — LLM_DAILY_REQUEST_LIMIT (see usageLimiter.js) is the
// real backstop against burning the embedding quota; computeJobMatchScore
// already falls back to keyword-only scoring the moment that limit is hit,
// so an unbounded loop here just means keyword scores fill in for free
// instead of a pair sitting unscored until a future run.
//
// Scores unscored (user, job) pairs for recent jobs — called from the cron
// schedule after each scrape, so newly-discovered jobs get a matchScore
// before the next time a user loads /jobs. Idempotent: only pairs with no
// matchScore.computedAt are considered, so re-running is always safe and
// cheap (an already-scored pair is a no-op query match, not a re-score).
async function scoreUnscoredJobMatches() {
  const cutoff = new Date(Date.now() - RECENCY_WINDOW_MS);
  const users = await User.find({}, { _id: 1 }).lean();
  if (!users.length) return { scored: 0, skipped: 0, errors: 0 };

  let scored = 0, skipped = 0, errors = 0;

  for (const user of users) {
    const profile = await CandidateProfile.findOne({ userId: user._id }).lean();
    if (!profile) { skipped++; continue; } // no profile yet — nothing to score against

    const scoredJobIds = await UserJobState.find(
      { userId: user._id, 'matchScore.computedAt': { $exists: true } },
      { jobId: 1 }
    ).lean().then(rows => rows.map(r => r.jobId));

    const jobs = await Job.find({
      date: { $gte: cutoff },
      _id: { $nin: scoredJobIds },
    }).lean();

    for (const job of jobs) {
      try {
        const { total, keywordScore, semanticScore } = await computeJobMatchScore(job, profile);
        await UserJobState.findOneAndUpdate(
          { userId: user._id, jobId: job._id },
          { $set: { matchScore: { total, keywordScore, semanticScore, computedAt: new Date() } } },
          { upsert: true }
        );
        scored++;
      } catch (err) {
        // Genuinely unexpected error (not a quota/provider fallback, which
        // computeJobMatchScore already absorbs) — log and keep going so one
        // bad job/profile doesn't stall scoring for the rest of the batch.
        console.error(`[jobMatchBatch] failed to score job ${job._id} for user ${user._id}:`, err.message);
        errors++;
      }
    }
  }

  return { scored, skipped, errors };
}

module.exports = { scoreUnscoredJobMatches };
