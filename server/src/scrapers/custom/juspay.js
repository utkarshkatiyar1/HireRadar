const axios     = require('axios');
const normalize = require('../../utils/normalize');

module.exports = async (src) => {
  const { data } = await axios.get(
    'https://joinus.juspay.in/api/careerJobOpening?limit=1000&isGlobal=true',
    {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      timeout: 15000,
    }
  );

  return (data.allJobs ?? [])
    .filter(j => j.opening_status)
    .map(j => normalize({
      title:      j.job_title    ?? '',
      company:    'Juspay',
      location:   j.job_location ?? '',
      exp:        j.experience_year ? `${j.experience_year}+ years` : '',
      department: j.category     ?? '',
      url:        `https://juspay.io/careers?jobId=${encodeURIComponent(j.job_id)}`,
      date:       new Date(),
    }));
};
