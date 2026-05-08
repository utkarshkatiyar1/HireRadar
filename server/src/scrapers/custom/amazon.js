const axios     = require('axios');
const normalize = require('../../utils/normalize');

module.exports = async (src) => {
  const jobs = [];
  let offset = 0;
  const limit = 20;

  while (true) {
    const { data } = await axios.get('https://www.amazon.jobs/en/search.json', {
      params: {
        normalized_keywords: src.keywords[0] ?? 'react',
        normalized_location: 'india',
        job_count:           limit,
        offset,
        sort:                'recent',
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept:       'application/json',
        Referer:      'https://www.amazon.jobs/',
      },
      timeout: 15000,
    });

    const items = data.jobs ?? [];
    if (!items.length) break;

    for (const j of items) {
      jobs.push(normalize({
        title:    j.title ?? '',
        company:  src.company,
        location: [j.city, j.state, j.country_code === 'IN' ? 'India' : j.country_code].filter(Boolean).join(', '),
        exp:      j.job_category ?? '',
        url:      `https://www.amazon.jobs${j.job_path ?? ''}`,
        date:     new Date(j.posted_date ?? Date.now()),
      }));
    }

    const total = data.hits ?? 0;
    if (!items.length || offset + limit >= total || offset >= 100) break;
    offset += limit;
  }

  return jobs;
};
