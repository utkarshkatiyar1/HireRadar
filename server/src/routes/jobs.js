const router = require('express').Router();
const mongoose = require('mongoose');
const { Job, User, UserJobState, UserPrefs, Source } = require('../utils/db');
const { isLocationOk, isSenior, scoreJob } = require('../utils/filter');
const { requireAuth } = require('../middleware/auth');

const oid = (s) => new mongoose.Types.ObjectId(s);

// Merge per-user state onto jobs and drop dismissed.
const mergeUserState = async (jobs, userId) => {
  if (!jobs.length) return [];
  const ids = jobs.map(j => j._id);
  const states = await UserJobState.find({ userId, jobId: { $in: ids } }).lean();
  const byJob = new Map(states.map(s => [String(s.jobId), s]));
  return jobs
    .map(j => {
      const s = byJob.get(String(j._id));
      return {
        ...j,
        applied:   !!s?.applied,
        appliedAt: s?.appliedAt ?? null,
        dismissed: !!s?.dismissed,
      };
    })
    .filter(j => !j.dismissed);
};

router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);

    const cutoff = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

    // Push cutoff to DB — only load recent jobs + any the user applied to
    const appliedIds = (await UserJobState.find({ userId, applied: true }, { jobId: 1 }).lean())
      .map(s => s.jobId);

    const all = await Job.find({
      $or: [
        { firstSeen: { $gte: cutoff } },
        { _id: { $in: appliedIds } },
      ],
    }).sort({ firstSeen: -1 }).lean();

    const withState = await mergeUserState(all, userId);

    if (req.query.raw === '1') return res.json(withState);

    const prefs = (await UserPrefs.findOne({ userId }).lean()) ?? {};
    const threshold = prefs.scoreThreshold ?? 0;

    const jobs = withState
      .filter(j => isLocationOk(j.location, prefs) && !isSenior(j.title, prefs))
      .map(j => ({ ...j, score: scoreJob(j, prefs) }))
      .filter(j => j.score >= threshold)
      .sort((a, b) => b.score - a.score || new Date(b.firstSeen) - new Date(a.firstSeen));
    res.json(jobs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/sources', async (_req, res) => {
  try {
    const list = await Source.find({ enabled: true }, { company: 1, ats: 1, _id: 0 }).sort({ company: 1 }).lean();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/stats', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const now    = new Date();
    const day0   = new Date(now); day0.setUTCHours(0, 0, 0, 0);
    const week0  = new Date(day0); week0.setUTCDate(day0.getUTCDate() - 6);
    const month0 = new Date(day0); month0.setUTCDate(day0.getUTCDate() - 29);
    const day1   = new Date(day0); day1.setUTCDate(day0.getUTCDate() + 1);

    const daily = await UserJobState.aggregate([
      { $match: { userId, applied: true, appliedAt: { $gte: month0 } } },
      { $group: {
          _id:   { $dateToString: { format: '%Y-%m-%d', date: '$appliedAt' } },
          count: { $sum: 1 },
      }},
      { $sort: { _id: 1 } },
    ]);

    const topCompanies = await UserJobState.aggregate([
      { $match: { userId, applied: true } },
      { $lookup: { from: 'jobs', localField: 'jobId', foreignField: '_id', as: 'job' } },
      { $unwind: '$job' },
      { $group: {
          _id: '$job.company',
          count: { $sum: 1 },
          lastApplied: { $max: '$appliedAt' },
          roles: { $addToSet: '$job.title' },
      }},
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]);

    const [totals] = await UserJobState.aggregate([
      { $match: { userId } },
      { $facet: {
          applied:   [{ $match: { applied: true } }, { $count: 'n' }],
          appToday:  [{ $match: { applied: true, appliedAt: { $gte: day0 } } }, { $count: 'n' }],
          appWeek:   [{ $match: { applied: true, appliedAt: { $gte: week0 } } }, { $count: 'n' }],
          appMonth:  [{ $match: { applied: true, appliedAt: { $gte: month0 } } }, { $count: 'n' }],
      }},
    ]);

    const total    = await Job.countDocuments({});
    const newToday = await Job.countDocuments({ firstSeen: { $gte: day0, $lt: day1 } });
    const pick = (arr) => arr?.[0]?.n ?? 0;

    res.json({
      daily,
      topCompanies,
      total,
      newToday,
      applied:  pick(totals.applied),
      appToday: pick(totals.appToday),
      appWeek:  pick(totals.appWeek),
      appMonth: pick(totals.appMonth),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/leaderboard', requireAuth, async (_req, res) => {
  try {
    const now   = new Date();
    const day0  = new Date(now); day0.setUTCHours(0, 0, 0, 0);
    const week0 = new Date(day0); week0.setUTCDate(day0.getUTCDate() - 6);

    const [allUsers, stats] = await Promise.all([
      User.find({}).select('_id name').lean(),
      UserJobState.aggregate([
        { $match: { applied: true } },
        { $group: {
            _id:      '$userId',
            total:    { $sum: 1 },
            today:    { $sum: { $cond: [{ $gte: ['$appliedAt', day0] },  1, 0] } },
            thisWeek: { $sum: { $cond: [{ $gte: ['$appliedAt', week0] }, 1, 0] } },
        }},
      ]),
    ]);

    const byUser = new Map(stats.map(s => [String(s._id), s]));

    const rows = allUsers
      .map(u => {
        const s = byUser.get(String(u._id)) ?? { total: 0, today: 0, thisWeek: 0 };
        return { userId: u._id, name: u.name, total: s.total, today: s.today, thisWeek: s.thisWeek };
      })
      .sort((a, b) => b.total - a.total || b.thisWeek - a.thisWeek)
      .slice(0, 50);

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/dismiss', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const jobId  = oid(req.params.id);
    const state = await UserJobState.findOneAndUpdate(
      { userId, jobId },
      { $set: { dismissed: true } },
      { new: true, upsert: true }
    );
    res.json(state);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/apply', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const jobId  = oid(req.params.id);
    const state = await UserJobState.findOneAndUpdate(
      { userId, jobId },
      { $set: { applied: true, appliedAt: new Date() } },
      { new: true, upsert: true }
    );
    res.json(state);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
