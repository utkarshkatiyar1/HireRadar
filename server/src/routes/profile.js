const router   = require('express').Router();
const mongoose = require('mongoose');
const { User, UserPrefs } = require('../utils/db');
const { requireAuth }     = require('../middleware/auth');
const { DEFAULTS }        = require('../utils/filter');

const oid = s => new mongoose.Types.ObjectId(s);

// GET /profile — returns user info + prefs (auto-seeds defaults on first call)
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const user   = await User.findById(userId).select('name email').lean();
    let prefs    = await UserPrefs.findOne({ userId }).lean();
    if (!prefs) {
      prefs = await UserPrefs.create({ userId, ...DEFAULTS });
    }
    res.json({ user, prefs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /profile/filters — save user prefs
router.put('/filters', requireAuth, async (req, res) => {
  try {
    const userId = oid(req.user.uid);
    const { locationAllow, seniorityExclude, frontendSignals, juniorSignals, negativeSignals, scoreThreshold } = req.body;
    const prefs = await UserPrefs.findOneAndUpdate(
      { userId },
      { $set: { locationAllow, seniorityExclude, frontendSignals, juniorSignals, negativeSignals, scoreThreshold } },
      { new: true, upsert: true }
    );
    res.json(prefs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
