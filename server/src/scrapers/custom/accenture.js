const { chromium } = require('playwright');

// Accenture careers is a JS-rendered SPA — requires Playwright.
// First-time setup: run `npx playwright install chromium` in server/
const SEARCH_URL = 'https://www.accenture.com/in-en/careers/jobsearch';

module.exports = async (src) => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx  = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  const jobs = [];
  const captured = [];

  page.on('response', async res => {
    try {
      const url = res.url();
      const ct  = res.headers()['content-type'] ?? '';
      if (ct.includes('json') && /job|search|career/i.test(url)) {
        const json = await res.json().catch(() => null);
        if (json) captured.push(json);
      }
    } catch {}
  });

  try {
    await page.goto(SEARCH_URL, { waitUntil: 'networkidle', timeout: 45000 });

    const input = await page.$(
      'input[type="search"], input[placeholder*="earch"], [class*="search"] input'
    );
    if (input) {
      await input.fill('react developer');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(4000);
    }

    const domItems = await page.evaluate(() => {
      const rows = [];
      const titleNodes = document.querySelectorAll(
        '[class*="title"],[class*="jobTitle"],[class*="job-title"],[class*="cmp-teaser__title"]'
      );
      titleNodes.forEach(el => {
        const card = el.closest(
          'li, article, [class*="card"], [class*="result"], [class*="item"], [class*="teaser"]'
        );
        if (!card) return;
        const link = card.querySelector('a[href]');
        if (!link) return;
        rows.push({
          title:    el.textContent.trim(),
          location: card.querySelector('[class*="location"],[class*="city"],[class*="place"]')?.textContent?.trim() ?? '',
          exp:      card.querySelector('[class*="exp"],[class*="experience"],[class*="year"],[class*="level"]')?.textContent?.trim() ?? '',
          url:      link.href,
          date:     card.querySelector('[class*="date"],[class*="posted"],[class*="time"]')?.textContent?.trim() ?? '',
        });
      });
      return rows;
    });

    for (const j of domItems) {
      if (j.title && j.url) {
        jobs.push({ ...j, company: src.company, date: new Date(j.date || Date.now()) });
      }
    }

    if (!jobs.length) {
      for (const json of captured) {
        const items =
          json.jobs ?? json.results ?? json.data ??
          json.jobListings ?? json.jobList ?? [];
        if (!Array.isArray(items)) continue;
        for (const j of items) {
          const title  = j.title ?? j.jobTitle ?? j.name ?? '';
          const rawUrl = j.url ?? j.jobUrl ?? j.link ?? j.applyUrl ?? j.redirectURL ?? '';
          if (!title || !rawUrl) continue;
          jobs.push({
            title,
            company:  src.company,
            location: j.location ?? j.city ?? j.primaryLocation ?? j.locationName ?? '',
            exp:      j.experienceLevel ?? j.experience ?? j.minExperience ?? '',
            url:      rawUrl.startsWith('http') ? rawUrl : `https://www.accenture.com${rawUrl}`,
            date:     new Date(j.date ?? j.postedDate ?? j.publishedDate ?? Date.now()),
          });
        }
      }
    }
  } finally {
    await browser.close();
  }

  return jobs;
};
