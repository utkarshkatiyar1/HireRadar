const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { SECRET } = require('../middleware/auth');
const { subscribe, getBuffer, ADMIN_EMAIL } = require('../utils/logger');

let scrapeRunning = false;

// For SSE, EventSource can't set headers — read token from query param OR Authorization header
const requireAdmin = (req, res, next) => {
  const h = (req.headers.authorization || '').replace('Bearer ', '');
  const token = h || req.query.token || '';
  if (!token) return res.status(401).end();
  try {
    const user = jwt.verify(token, SECRET);
    if (user.email !== ADMIN_EMAIL) return res.status(403).end();
    req.user = user;
    next();
  } catch {
    res.status(401).end();
  }
};

// GET /admin/logs — SSE stream of all server logs (admin only)
router.get('/logs', requireAdmin, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if ever proxied
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (typeof res.flush === 'function') res.flush();
  };

  // Send buffered history first
  send({ type: 'history', entries: getBuffer() });

  // Subscribe to live entries
  const unsubscribe = subscribe((entry) => send({ type: 'entry', entry }));

  // Keep-alive ping every 20s so proxies don't close idle connections
  const ping = setInterval(() => res.write(': ping\n\n'), 20_000);

  req.on('close', () => {
    clearInterval(ping);
    unsubscribe();
  });
});

// POST /admin/scrape — manually trigger a full scrape run (admin only)
router.post('/scrape', requireAdmin, async (req, res) => {
  if (scrapeRunning) return res.status(409).json({ error: 'Scrape already running' });
  scrapeRunning = true;
  res.json({ ok: true, message: 'Scrape started' });
  try {
    const scrape = require('../index');
    await scrape();
  } finally {
    scrapeRunning = false;
  }
});

// GET /admin/scrape — check if scrape is running
router.get('/scrape', requireAdmin, (_req, res) => {
  res.json({ running: scrapeRunning });
});

module.exports = router;
