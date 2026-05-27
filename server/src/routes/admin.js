const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const axios  = require('axios');
const { SECRET } = require('../middleware/auth');
const { subscribe, getBuffer, clearBuffer, ADMIN_EMAIL } = require('../utils/logger');
const { Source } = require('../utils/db');
const { DEFAULTS } = require('../config/sources');

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

// DELETE /admin/logs — clear the server-side log buffer (admin only)
router.delete('/logs', requireAdmin, (_req, res) => {
  clearBuffer();
  res.json({ ok: true });
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

// ─── Source management ────────────────────────────────────────────────────────

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const ATS_DETECTORS = {
  greenhouse: {
    patterns: [
      /boards(?:-api)?\.greenhouse\.io\/(?:v1\/boards\/)?([a-z0-9_-]+)/gi,
      /embed\.greenhouse\.io\/embed\/job_board\?(?:[^"']*&)?token=([a-z0-9_-]+)/gi,
    ],
    async validate(token) {
      const { data } = await axios.get(
        `https://boards-api.greenhouse.io/v1/boards/${token}/jobs`,
        { params: { content: false }, timeout: 10000, headers: { 'User-Agent': UA } }
      );
      return Array.isArray(data?.jobs);
    },
    config: (token) => ({ ats: 'greenhouse', greenhouseToken: token }),
  },
  lever: {
    patterns: [/(?:jobs|api)\.lever\.co\/(?:v0\/postings\/)?([a-z0-9_-]+)/gi],
    async validate(token) {
      const { data } = await axios.get(
        `https://api.lever.co/v0/postings/${token}`,
        { params: { mode: 'json' }, timeout: 10000, headers: { 'User-Agent': UA } }
      );
      return Array.isArray(data);
    },
    config: (token) => ({ ats: 'lever', leverToken: token }),
  },
  ashby: {
    patterns: [
      /jobs\.ashbyhq\.com\/([a-z0-9_-]+)/gi,
      /api\.ashbyhq\.com\/posting-api\/job-board\/([a-z0-9_-]+)/gi,
    ],
    async validate(slug) {
      const { data } = await axios.get(
        `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
        { timeout: 10000, headers: { 'User-Agent': UA } }
      );
      return !!(data?.jobs || data?.jobPostings);
    },
    config: (slug) => ({ ats: 'ashby', ashbySlug: slug }),
  },
  smartrecruiters: {
    patterns: [
      /(?:careers|jobs)\.smartrecruiters\.com\/([a-zA-Z0-9_-]+)/g,
      /api\.smartrecruiters\.com\/v1\/companies\/([a-zA-Z0-9_-]+)/g,
    ],
    async validate(slug) {
      const { data } = await axios.get(
        `https://api.smartrecruiters.com/v1/companies/${slug}/postings`,
        { params: { limit: 1 }, timeout: 10000, headers: { 'User-Agent': UA } }
      );
      return Array.isArray(data?.content);
    },
    config: (slug) => ({ ats: 'smartrecruiters', smartrecruitersSlug: slug }),
  },
  workday: {
    patterns: [
      /([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com(?:\/[a-z]{2}-[A-Z]{2})?\/([a-zA-Z0-9_-]+)/g,
    ],
    async validate({ tenant, wdNum, site }) {
      const base = `https://${tenant}.${wdNum}.myworkdayjobs.com`;
      await axios.post(
        `${base}/wday/cxs/${tenant}/${site}/jobs`,
        { appliedFacets: {}, limit: 1, offset: 0, searchText: '' },
        { timeout: 10000, headers: { 'Content-Type': 'application/json', 'User-Agent': UA } }
      );
      return true;
    },
    config: ({ tenant, wdNum, site }) => ({
      ats: 'workday',
      workdayBase:   `https://${tenant}.${wdNum}.myworkdayjobs.com`,
      workdayTenant: tenant,
      workdaySite:   site,
    }),
  },
  eightfold: {
    patterns: [/([a-z0-9-]+)\.eightfold\.ai/gi],
    async validate() { return true; },
    config: (subdomain) => ({ ats: 'eightfold', eightfoldBase: `https://${subdomain}.eightfold.ai` }),
  },
};

async function detectAts(url, html) {
  const text = url + '\n' + html;
  for (const [name, def] of Object.entries(ATS_DETECTORS)) {
    for (const re of def.patterns) {
      const hits = [...text.matchAll(re)];
      if (!hits.length) continue;
      if (name === 'workday') {
        const [, tenant, wdNum, rawSite] = hits[0];
        const skip = new Set(['job', 'jobs', 'search', 'apply', 'home']);
        const site = skip.has(rawSite?.toLowerCase()) ? 'jobs' : rawSite;
        return { atsName: name, token: { tenant, wdNum, site }, def };
      }
      return { atsName: name, token: hits[0][1].toLowerCase(), def };
    }
  }
  return null;
}

// POST /admin/probe — fetch a careers URL and detect ATS
router.post('/probe', requireAdmin, async (req, res) => {
  const { careersUrl } = req.body;
  if (!careersUrl) return res.status(400).json({ error: 'careersUrl required' });

  let html = '', finalUrl = careersUrl;
  try {
    const r = await axios.get(careersUrl, {
      timeout: 20000,
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
      maxRedirects: 10,
    });
    html = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    finalUrl = r.request?.res?.responseUrl ?? r.config?.url ?? careersUrl;
  } catch (e) {
    return res.status(422).json({ error: `Could not fetch page: ${e.message}` });
  }

  const found = await detectAts(finalUrl, html);
  if (!found) return res.json({ detected: false, finalUrl });

  let valid = false;
  try { valid = await found.def.validate(found.token); } catch { valid = false; }

  res.json({
    detected:  true,
    atsName:   found.atsName,
    token:     found.token,
    valid,
    config:    found.def.config(found.token),
    finalUrl,
  });
});

// GET /admin/sources          — list all sources
// GET /admin/sources?health=1 — only sources with failures or zero jobs
router.get('/sources', requireAdmin, async (req, res) => {
  try {
    const filter = req.query.health === '1'
      ? { $or: [{ consecutiveFailures: { $gt: 0 } }, { lastJobCount: 0 }] }
      : {};
    const sources = await Source.find(filter).sort({ consecutiveFailures: -1, company: 1 }).lean();
    res.json(sources);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /admin/sources — add a new source
router.post('/sources', requireAdmin, async (req, res) => {
  try {
    const { company, ...rest } = req.body;
    if (!company || !rest.ats) return res.status(400).json({ error: 'company and ats required' });
    const source = await Source.create({ company, ...rest });
    res.status(201).json(source);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: `${req.body.company} already exists` });
    res.status(500).json({ error: e.message });
  }
});

// PATCH /admin/sources/:company/toggle — enable or disable
router.patch('/sources/:company/toggle', requireAdmin, async (req, res) => {
  try {
    const source = await Source.findOne({ company: req.params.company });
    if (!source) return res.status(404).json({ error: 'Not found' });
    source.enabled = !source.enabled;
    await source.save();
    res.json({ company: source.company, enabled: source.enabled });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /admin/sources/:company — remove a source
router.delete('/sources/:company', requireAdmin, async (req, res) => {
  try {
    const r = await Source.deleteOne({ company: req.params.company });
    if (!r.deletedCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
