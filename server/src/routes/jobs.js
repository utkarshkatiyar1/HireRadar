const router = require('express').Router();
const { Job } = require('../utils/db');
const sources = require('../config/sources');
const { isLocationOk, isSenior, scoreJob } = require('../utils/filter');

router.get('/', async (req, res) => {
  try {
    const all = await Job.find({ dismissed: { $ne: true } }).sort({ firstSeen: -1 }).lean();
    if (req.query.raw === '1') return res.json(all);
    const jobs = all
      .filter(j => isLocationOk(j.location) && !isSenior(j.title))
      .map(j => ({ ...j, score: scoreJob(j) }))
      .filter(j => j.score >= 0)
      .sort((a, b) => b.score - a.score || new Date(b.firstSeen) - new Date(a.firstSeen));
    res.json(jobs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/sources', (_req, res) => {
  const list = sources.map(s => ({
    company: s.company,
    ats:     s.ats,
  }));
  res.json(list);
});

router.get('/stats', async (req, res) => {
  try {
    const now    = new Date();
    const day0   = new Date(now); day0.setHours(0, 0, 0, 0);
    const week0  = new Date(day0); week0.setDate(day0.getDate() - 6);
    const month0 = new Date(day0); month0.setDate(day0.getDate() - 29);
    const day1   = new Date(day0); day1.setDate(day0.getDate() + 1);

    const daily = await Job.aggregate([
      { $match: { applied: true, appliedAt: { $gte: month0 } } },
      { $group: {
          _id:   { $dateToString: { format: '%Y-%m-%d', date: '$appliedAt' } },
          count: { $sum: 1 },
      }},
      { $sort: { _id: 1 } },
    ]);

    const topCompanies = await Job.aggregate([
      { $match: { applied: true } },
      { $group: { _id: '$company', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]);

    const [totals] = await Job.aggregate([
      { $facet: {
          total:     [{ $count: 'n' }],
          applied:   [{ $match: { applied: true } }, { $count: 'n' }],
          newToday:  [{ $match: { firstSeen: { $gte: day0, $lt: day1 } } }, { $count: 'n' }],
          appToday:  [{ $match: { applied: true, appliedAt: { $gte: day0 } } }, { $count: 'n' }],
          appWeek:   [{ $match: { applied: true, appliedAt: { $gte: week0 } } }, { $count: 'n' }],
          appMonth:  [{ $match: { applied: true, appliedAt: { $gte: month0 } } }, { $count: 'n' }],
      }},
    ]);

    const pick = (arr) => arr?.[0]?.n ?? 0;

    res.json({
      daily,
      topCompanies,
      total:    pick(totals.total),
      applied:  pick(totals.applied),
      newToday: pick(totals.newToday),
      appToday: pick(totals.appToday),
      appWeek:  pick(totals.appWeek),
      appMonth: pick(totals.appMonth),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/dismiss', async (req, res) => {
  try {
    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { dismissed: true },
      { new: true }
    );
    if (!job) return res.status(404).json({ error: 'Not found' });
    res.json(job);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/apply', async (req, res) => {
  try {
    const job = await Job.findByIdAndUpdate(
      req.params.id,
      { applied: true, appliedAt: new Date() },
      { new: true }
    );
    if (!job) return res.status(404).json({ error: 'Not found' });
    res.json(job);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
