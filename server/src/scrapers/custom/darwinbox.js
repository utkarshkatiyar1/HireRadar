const { chromium } = require('playwright');
const normalize     = require('../../utils/normalize');

const CAREERS_URL = 'https://darwinbox.darwinbox.in/ms/candidatev2/main/careers/allJobs';

const stripHtml = (s) => String(s || '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'")
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

module.exports = async (src) => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx  = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  let captured = null;

  page.on('response', async res => {
    try {
      const url = res.url();
      const ct  = res.headers()['content-type'] ?? '';
      if (ct.includes('json') && url.includes('candidateapi/job/alljobs')) {
        captured = await res.json().catch(() => null);
      }
    } catch {}
  });

  try {
    await page.goto(CAREERS_URL, { waitUntil: 'networkidle', timeout: 60000 });
  } finally {
    await browser.close();
  }

  const jobs = (captured?.data ?? []).map(j => {
    const jdText   = stripHtml(j.jd);
    const locMatch = jdText.match(/bangalore|mumbai|hyderabad|pune|chennai|delhi|noida|gurgaon|india|remote/i);
    const location = j.location || (locMatch ? locMatch[0] : 'India');

    return normalize({
      title:      j.designation_display_name ?? '',
      company:    'Darwinbox',
      location,
      exp:        j.experience ?? '',
      department: j.department ?? '',
      url:        `https://darwinbox.darwinbox.in/ms/candidatev2/darwinbox/careers/jobdetails/${j.id}`,
      date:       new Date(),
    });
  });

  return jobs;
};
