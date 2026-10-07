const axios     = require('axios');
const cheerio   = require('cheerio');
const normalize = require('../../utils/normalize');

// Generic RSS/Atom job-feed scraper.
// src must include: feedUrl
// Optional: itemSelector (defaults to 'item, entry' to cover both RSS and Atom).
module.exports = async (src) => {
  const { data: xml } = await axios.get(src.feedUrl, {
    timeout: 15000,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  const $ = cheerio.load(xml, { xmlMode: true });
  const itemSelector = src.itemSelector || 'item, entry';

  return $(itemSelector).map((_, el) => {
    const item = $(el);
    const title = item.find('title').first().text().trim();
    const link  = item.find('link').first().attr('href')
      || item.find('link').first().text().trim();
    const pubDateRaw = item.find('pubDate, published, updated').first().text().trim();
    const description = item.find('description, summary, content').first().text().replace(/<[^>]+>/g, ' ').trim();

    const job = normalize({
      title,
      company:    src.company,
      location:   src.defaultLocation || '',
      exp:        '',
      department: '',
      url:        link,
      date:       new Date(pubDateRaw || Date.now()),
    });
    job.description = description;
    job._postedAtHint = pubDateRaw && !isNaN(new Date(pubDateRaw))
      ? { date: new Date(pubDateRaw), source: 'API' }
      : null;
    return job;
  }).get().filter(j => j.title && j.url);
};
