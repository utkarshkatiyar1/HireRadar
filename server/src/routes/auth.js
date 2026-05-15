const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { User } = require('../utils/db');
const { sign, requireAuth } = require('../middleware/auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/signup', async (req, res) => {
  try {
    const email    = String(req.body.email    || '').trim().toLowerCase();
    const name     = String(req.body.name     || '').trim();
    const password = String(req.body.password || '');

    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email' });
    if (name.length < 2)        return res.status(400).json({ error: 'Name too short' });
    if (password.length < 6)    return res.status(400).json({ error: 'Password min 6 chars' });

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, name, passwordHash });

    res.json({ token: sign(user), user: { id: user._id, email: user.email, name: user.name } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const email    = String(req.body.email    || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    res.json({ token: sign(user), user: { id: user._id, email: user.email, name: user.name } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ id: req.user.uid, email: req.user.email, name: req.user.name });
});

module.exports = router;
