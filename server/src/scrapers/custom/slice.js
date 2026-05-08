const axios     = require('axios');
const cheerio   = require('cheerio');
const normalize = require('../../utils/normalize');

module.exports = async (src) => {
  const { data } = await axios.get(
    'https://slice.bank.in/careers/open-positions/',
    {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
      timeout: 15000,
    }
  );

  const $    = cheerio.load(data);
  const jobs = [];

  $('a[aria-label*="view job details"]').each((_, el) => {
    const spans    = $(el).find('span');
    const title    = spans.eq(0).text().trim();
    const dept     = spans.eq(1).text().trim();
    const location = spans.eq(2).text().trim();
    const href     = $(el).attr('href') || '';

    if (!title) return;

    jobs.push(normalize({
      title,
      company:    'Slice',
      location,
      department: dept,
      exp:        '',
      url:        `https://slice.bank.in${href}`,
      date:       new Date(),
    }));
  });

  return jobs;
};
