const { chromium } = require('playwright');
const normalize     = require('../../utils/normalize');

// Eightfold AI ATS — Playwright scraper.
// Their /api/v2/jobs/search endpoint now requires auth (returns 401/404).
// Strategy: load the careers page and intercept the XHR responses the SPA fires.
// src must include: eightfoldBase (e.g. "https://microsoft.eightfold.ai")
module.exports = async (src) => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx  = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  const captured = [];

  page.on('response', async res => {
    try {
      const ct = res.headers()['content-type'] ?? '';
      if (!ct.includes('json')) return;
      const json = await res.json().catch(() => null);
      if (!json) return;
      const items = json.positions ?? json.jobs ?? json.data ?? json.postings ?? json.results ?? [];
      if (Array.isArray(items) && items.length > 0) captured.push(...items);
    } catch {}
  });

  try {
    await page.goto(`${src.eightfoldBase}/careers`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Scroll to trigger lazy-loaded pages
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
  } finally {
    await browser.close();
  }

  const seen = new Set();
  return captured
    .map(j => normalize({
      title:    j.name ?? j.title ?? '',
      company:  src.company,
      location: j.location ?? j.city_name ?? j.primary_location ?? j.location_name ?? '',
      exp:      j.experience ?? j.min_years_experience ?? '',
      url:      `${src.eightfoldBase}/careers?job=${j.id ?? ''}`,
      date:     new Date(j.updated_date ?? j.publish_date ?? Date.now()),
    }))
    .filter(j => {
      if (!j.title || seen.has(j.url)) return false;
      seen.add(j.url);
      return true;
    });
};
