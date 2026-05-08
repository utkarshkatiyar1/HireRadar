const axios     = require('axios');
const normalize = require('../../utils/normalize');

module.exports = async (src) => {
  const jobs = [];
  let offset = 0;
  const limit = 100;

  while (jobs.length < 500) {
    const { data } = await axios.get(
      `https://api.smartrecruiters.com/v1/companies/${src.smartrecruitersSlug}/postings`,
      {
        params: { limit, offset },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 30000,
      }
    );

    const postings = data.content ?? [];
    for (const j of postings) {
      jobs.push(normalize({
        title:      j.name ?? '',
        company:    src.company,
        location:   [j.location?.city, j.location?.countryCode].filter(Boolean).join(', '),
        department: j.department?.label ?? '',
        exp:        '',
        url:        j.postingUrl ?? `https://jobs.smartrecruiters.com/${src.smartrecruitersSlug}/${j.id}`,
        date:       new Date(j.releasedDate ?? Date.now()),
      }));
    }

    if (postings.length < limit) break;
    offset += limit;
  }

  return jobs;
};
