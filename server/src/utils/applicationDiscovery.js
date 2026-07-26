const { Job, User } = require('../utils/db');
const { Application } = require('../models/application');
const ApplicationPolicy = require('../models/applicationPolicy');
const { scoreJob, DEFAULTS } = require('../utils/filter');
const { getPipelineQueue } = require('../queue/queues');

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

  const docs = await Application.insertMany(
    candidates.map(job => ({
      userId,
      jobId: job._id,
      status: 'DISCOVERED',
      statusHistory: [{ status: 'DISCOVERED', at: new Date(), note: 'created by discovery' }],
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
