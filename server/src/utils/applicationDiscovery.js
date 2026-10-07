const { Job, User } = require('../utils/db');
const { Application } = require('../models/application');
const ApplicationPolicy = require('../models/applicationPolicy');
const { scoreJob, DEFAULTS } = require('../utils/filter');
const { getPipelineQueue } = require('../queue/queues');

// Job.url has a unique index, which only dedupes the SAME url being
// scraped twice — it does nothing when the identical real-world posting is
// discovered via two different urls (e.g. a company's own careers page vs.
// its Greenhouse board mirror for the same role), which produces two
// separate Job documents and, without this, two separate Applications for
// what is really one job at one employer. Normalizing company+title+
// location and checking for an existing recent match is a soft signal, not
// a hard block: two DIFFERENT roles at the same company with similar
// titles/locations (extremely common — "Software Engineer" at the same
// company posted twice for different teams) would produce false positives
// if this silently skipped creation. Instead it's surfaced via
// possibleDuplicateOf on the Application for a human to see and decide,
// never used to auto-skip.
const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const DUPLICATE_WINDOW_DAYS = 30;

async function findPossibleDuplicateJobId(job, userId) {
  const windowStart = new Date(Date.now() - DUPLICATE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const candidates = await Job.find({
    _id: { $ne: job._id },
    company: job.company,
    date: { $gte: windowStart },
  }, { _id: 1, title: 1, location: 1 }).lean();

  const targetTitle = normalize(job.title);
  const targetLocation = normalize(job.location);
  const match = candidates.find(c => normalize(c.title) === targetTitle && normalize(c.location) === targetLocation);
  if (!match) return null;

  // Only flag if the candidate has (or will have) an Application against
  // the OTHER Job doc too — a duplicate Job with no Application on it isn't
  // actionable for the user, just noise.
  const existingApp = await Application.findOne({ userId, jobId: match._id }, { _id: 1 }).lean();
  return existingApp ? match._id : null;
}

// Event-driven Application creation — called after scrape() completes, NOT
// from a GET request. A GET must never create records/enqueue work, since
// that breaks under polling, page refresh, multiple tabs, or monitoring
// probes (see the plan's Pipeline orchestration section for the reasoning).
//
// Runs a cheap deterministic pre-filter (existing filter.js keyword score, no
// LLM — no real fitScore exists yet at this point) and creates DISCOVERED
// Applications only for jobs that clear it and aren't policy-blocked.
// ApplicationPolicy.minimumScore is intentionally NOT enforced here — that
// happens after agents/fitScoring.js runs a real semantic score.
async function discoverApplicationsForAllUsers({ sinceJobIds } = {}) {
  const users = await User.find({}, { _id: 1 }).lean();
  let totalCreated = 0;

  for (const user of users) {
    const created = await discoverApplicationsForUser(user._id, { sinceJobIds });
    totalCreated += created;
  }

  return { usersProcessed: users.length, applicationsCreated: totalCreated };
}

async function discoverApplicationsForUser(userId, { sinceJobIds } = {}) {
  const policy = await ApplicationPolicy.findOne({ userId }).lean() || {};
  const blockedCompanies = new Set((policy.blockedCompanies || []).map(c => c.toLowerCase()));
  const blockedLocations = (policy.blockedLocations || []).map(l => l.toLowerCase());

  const jobFilter = sinceJobIds?.length ? { _id: { $in: sinceJobIds } } : {};
  const jobs = await Job.find(jobFilter).lean();
  if (!jobs.length) return 0;

  const existing = await Application.find(
    { userId, jobId: { $in: jobs.map(j => j._id) } },
    { jobId: 1 }
  ).lean();
  const alreadyTracked = new Set(existing.map(a => String(a.jobId)));

  const candidates = jobs.filter(job => {
    if (alreadyTracked.has(String(job._id))) return false;
    if (blockedCompanies.has((job.company || '').toLowerCase())) return false;
    if (blockedLocations.some(loc => (job.location || '').toLowerCase().includes(loc))) return false;

    // Cheap keyword-level pre-filter — screens out obvious mismatches only.
    const preliminaryScore = scoreJob(job, DEFAULTS);
    return preliminaryScore >= (DEFAULTS.scoreThreshold ?? 0);
  });

  if (!candidates.length) return 0;

  const possibleDuplicates = await Promise.all(
    candidates.map(job => findPossibleDuplicateJobId(job, userId))
  );

  const docs = await Application.insertMany(
    candidates.map((job, i) => ({
      userId,
      jobId: job._id,
      status: 'DISCOVERED',
      statusHistory: [{ status: 'DISCOVERED', at: new Date(), note: 'created by discovery' }],
      possibleDuplicateOf: possibleDuplicates[i] || undefined,
    })),
    { ordered: false }
  );

  // addBulk pipelines all N job-adds into far fewer Redis round-trips than
  // Promise.all(docs.map(queue.add)) — same number of logical BullMQ jobs
  // created, much less command overhead, which matters when a scrape cycle
  // or backfill discovers hundreds/thousands of jobs for a single user.
  const queue = getPipelineQueue();
  await queue.addBulk(docs.map(doc => ({
    name: 'evaluate',
    data: { applicationId: doc._id.toString() },
  })));

  return docs.length;
}

module.exports = { discoverApplicationsForAllUsers, discoverApplicationsForUser };
