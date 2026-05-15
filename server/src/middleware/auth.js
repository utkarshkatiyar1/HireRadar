const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
if (!process.env.JWT_SECRET) {
  console.warn('[auth] JWT_SECRET not set — using insecure dev fallback');
}

const sign = (user) =>
  jwt.sign({ uid: user._id.toString(), email: user.email, name: user.name }, SECRET, {
    expiresIn: '30d',
  });

const requireAuth = (req, res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = { sign, requireAuth, SECRET };
