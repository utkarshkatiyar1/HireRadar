const axios     = require('axios');
const cheerio   = require('cheerio');
const normalize = require('../../utils/normalize');

// Generic Taleo SSR scraper — works for any Taleo-powered careers portal.
// src must include: baseUrl, searchPath (with {offset} placeholder), selectors
// selectors: { card, title, location, link }
module.exports = async (src) => {
  const { baseUrl, searchPath, selectors: sel } = src;
  const jobs = [];
  let offset = 0;
  const step = 10;

  while (true) {
    const url = `${baseUrl}${searchPath.replace('{offset}', offset)}`;
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 20000,
    });

    const $ = cheerio.load(data);
    const cards = $(sel.card);
    if (!cards.length) break;

    cards.each((_, el) => {
      const card    = $(el);
      const titleEl = card.find(sel.title).first();
      const title   = titleEl.text().trim();
      let   href    = titleEl.attr('href') ?? '';
      if (href && !href.startsWith('http')) href = `${baseUrl}${href}`;

      const location = card.find(sel.location).text().trim();

      if (title && href) {
        jobs.push(normalize({
          title,
          company:  src.company,
          location,
          exp:      '',
          url:      href,
          date:     new Date(),
        }));
      }
    });

    // check if there's a next page
    const totalText = $('[class*="jobListTotalRecords"], [data-total]').first().text();
    const total     = parseInt(totalText.replace(/\D/g, '')) || 0;
    offset += step;
    if (offset >= total || offset >= 300) break;
  }

  return jobs;
};
