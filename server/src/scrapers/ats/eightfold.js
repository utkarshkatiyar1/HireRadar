const axios     = require('axios');
const normalize = require('../../utils/normalize');

// Generic Eightfold AI ATS scraper.
// src must include: eightfoldBase (e.g. "https://micron.eightfold.ai")
// Find base URL: open DevTools on careers page → Network → filter "eightfold" or "api/v2/jobs"
module.exports = async (src) => {
  const jobs = [];
  let page = 0;

  while (page < 5) {
    const { data } = await axios.post(
      `${src.eightfoldBase}/api/v2/jobs/search`,
      {
        keywords: src.keywords[0] ?? 'react',
        location: 'India',
        page,
        size: 20,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0',
          Accept: 'application/json',
        },
        timeout: 15000,
      }
    );

    const items = data.positions ?? data.jobs ?? data.data ?? [];
    if (!items.length) break;

    for (const j of items) {
      jobs.push(normalize({
        title:    j.name ?? j.title ?? '',
        company:  src.company,
        location: j.location ?? j.city_name ?? j.primary_location ?? '',
        exp:      j.experience ?? j.min_years_experience ?? '',
        url:      `${src.eightfoldBase}/careers?job=${j.id ?? ''}`,
        date:     new Date(j.updated_date ?? j.publish_date ?? Date.now()),
      }));
    }

    if (items.length < 20) break;
    page++;
  }

  return jobs;
};
