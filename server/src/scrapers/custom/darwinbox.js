const axios     = require('axios');
const normalize = require('../../utils/normalize');

// Strips HTML tags from Darwinbox's HTML-encoded JD field
const stripHtml = (s) => String(s || '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'")
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

module.exports = async (src) => {
  const { data } = await axios.get(
    'https://dbx.darwinbox.in/ms/candidateapi/job/alljobs?companyId=main',
    {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept:       'application/json',
        Referer:      'https://dbx.darwinbox.in/ms/candidatev2/main/careers/allJobs',
      },
      timeout: 15000,
    }
  );

  return (data.data ?? []).map(j => {
    // Extract location from JD if no clean field
    const jdText  = stripHtml(j.jd);
    const locMatch = jdText.match(/(?:bangalore|mumbai|hyderabad|pune|chennai|delhi|noida|gurgaon|india|remote)/i);
    const location = locMatch ? locMatch[0] : 'India';

    return normalize({
      title:      j.designation_display_name ?? '',
      company:    'Darwinbox',
      location,
      exp:        j.experience ?? '',
      department: '',
      url:        `https://dbx.darwinbox.in/ms/candidatev2/main/careers/jobdetails/${j.id}`,
      date:       new Date(),
    });
  });
};
