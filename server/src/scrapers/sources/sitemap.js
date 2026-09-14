const axios     = require('axios');
const cheerio   = require('cheerio');
const normalize = require('../../utils/normalize');

// Generic XML sitemap scraper for job-posting URLs.
// Many career sites publish a jobs sitemap (e.g. /sitemap-jobs.xml) with
// <url><loc>...</loc><lastmod>...</lastmod></url> entries. This adapter reads
// the sitemap for URL + lastmod, then extracts a title from the URL slug
// (since sitemaps don't carry a title/description) — treat `lastmod` as a
// low-confidence proxy for posting date (it's a *page modification* time, not
// necessarily a first-posted time).
//
// src must include: sitemapUrl
// Optional: urlFilter (substring match against <loc> to isolate job URLs from
// a general sitemap, e.g. "/careers/" or "/jobs/")
module.exports = async (src) => {
  const { data: xml } = await axios.get(src.sitemapUrl, {
    timeout: 15000,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  const $ = cheerio.load(xml, { xmlMode: true });

  const slugToTitle = (url) => {
    try {
      const path = new URL(url).pathname;
      const slug = path.split('/').filter(Boolean).pop() || '';
      return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    } catch {
      return '';
    }
  };

  return $('url').map((_, el) => {
    const loc     = $(el).find('loc').first().text().trim();
    const lastmod = $(el).find('lastmod').first().text().trim();

    if (!loc) return null;
    if (src.urlFilter && !loc.includes(src.urlFilter)) return null;

    const job = normalize({
      title:      slugToTitle(loc),
      company:    src.company,
      location:   src.defaultLocation || '',
      exp:        '',
      department: '',
      url:        loc,
      date:       new Date(lastmod || Date.now()),
    });
    job._postedAtHint = lastmod && !isNaN(new Date(lastmod))
      ? { date: new Date(lastmod), source: 'SITEMAP_LASTMOD' }
      : null;
    return job;
  }).get().filter(Boolean).filter(j => j.title && j.url);
};
