const axios     = require('axios');
const normalize = require('../../utils/normalize');

// Generic Greenhouse ATS scraper (public boards API — no auth required).
// src must include: greenhouseToken
// Find token: open DevTools on company careers page → Network → filter "greenhouse"
// URL pattern: boards-api.greenhouse.io/v1/boards/{token}/jobs
module.exports = async (src) => {
  const { data } = await axios.get(
    `https://boards-api.greenhouse.io/v1/boards/${src.greenhouseToken}/jobs`,
    {
      params: { content: true },
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }
  );

  return (data.jobs ?? []).map(j => normalize({
    title:      j.title ?? '',
    company:    src.company,
    location:   j.location?.name ?? '',
    exp:        '',
    department: j.departments?.[0]?.name ?? '',
    url:        j.absolute_url ?? '',
    date:       new Date(j.updated_at ?? Date.now()),
  }));
};
