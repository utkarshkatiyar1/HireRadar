const axios = require('axios');

const BASE = 'https://careers.ibm.com';

// IBM careers API endpoint — discovered via DevTools → Network → XHR on careers.ibm.com.
// If you get 404: open https://careers.ibm.com, search "react developer",
// watch DevTools Network tab for the JSON XHR call and update the path below.
module.exports = async (src) => {
  const jobs = [];
  let start = 0;
  const limit = 25;

  while (true) {
    const { data } = await axios.get(`${BASE}/gateway/api/v1/search/jobs`, {
      params: {
        keyword: 'react developer',
        country: 'IN',
        start,
        limit,
        sort:  'Date',
        order: 'DESC',
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept:       'application/json',
        Referer:      'https://careers.ibm.com/',
      },
      timeout: 15000,
    });

    const items = data.jobs ?? data.jobListings ?? data.results ?? [];
    if (!items.length) break;

    for (const j of items) {
      const city    = j.primaryCity?.name    ?? j.city    ?? '';
      const country = j.primaryCountry?.name ?? j.country ?? '';
      jobs.push({
        title:    j.title    ?? j.jobTitle ?? '',
        company:  src.company,
        location: [city, country].filter(Boolean).join(', '),
        exp:      j.experienceLevel ?? j.experience ?? '',
        url:      j.jobUrl ?? j.url ?? `${BASE}/job/${j.id ?? j.reqId ?? ''}/`,
        date:     new Date(j.postedDate ?? j.date ?? Date.now()),
      });
    }

    const total = data.totalJobsCount ?? data.total ?? 0;
    if (!total || start + limit >= total) break;
    start += limit;
    if (start >= 100) break;
  }

  return jobs;
};
