const axios     = require('axios');
const normalize = require('../../utils/normalize');

// Public Ashby job board API — no auth required.
// Docs: https://developers.ashbyhq.com/docs/public-job-posting-api
// Endpoint: GET https://api.ashbyhq.com/posting-api/job-board/{slug}
module.exports = async (src) => {
  const { data } = await axios.get(
    `https://api.ashbyhq.com/posting-api/job-board/${src.ashbySlug}`,
    {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      timeout: 15000,
    }
  );

  const postings = data?.jobs ?? data?.jobPostings ?? [];

  return postings
    .filter(j => j.isListed !== false)
    .map(j => normalize({
      title:      j.title ?? '',
      company:    src.company,
      location:   j.locationName ?? j.location?.name ?? j.location ?? '',
      department: j.team?.name ?? j.department?.name ?? '',
      exp:        '',
      url:        j.jobUrl ?? `https://jobs.ashbyhq.com/${src.ashbySlug}/${j.id}`,
      date:       new Date(j.publishedAt ?? j.publishedDate ?? Date.now()),
    }));
};
