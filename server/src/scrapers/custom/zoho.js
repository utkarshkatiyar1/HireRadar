const axios     = require('axios');
const normalize = require('../../utils/normalize');

module.exports = async (src) => {
  const { data } = await axios.get(
    'https://careers.zohocorp.com/recruit/v2/public/Job_Openings',
    {
      params:  { limit: 200 },
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      timeout: 15000,
    }
  );

  const jobs = data.data ?? data.response?.result ?? [];
  if (!Array.isArray(jobs)) return [];

  return jobs.map(j => normalize({
    title:      j.Job_Title   ?? j.title    ?? '',
    company:    'Zoho',
    location:   j.City        ?? j.location ?? '',
    department: j.Department  ?? '',
    exp:        j.Experience  ?? '',
    url:        j.Permalink   ?? 'https://careers.zohocorp.com',
    date:       new Date(j.Date_Opened ?? Date.now()),
  }));
};
