const axios     = require('axios');
const normalize = require('../../utils/normalize');

// Generic ZohoRecruit ATS scraper (public career site API — no auth required).
// src must include: zohoSubdomain, and optionally zohoPagename (default: 'Careers')
//                   and zohoTld ('in' | 'com', default: 'in')
// Find subdomain: company career URL → {subdomain}.zohorecruit.in/jobs/Careers
module.exports = async (src) => {
  const subdomain = src.zohoSubdomain;
  const tld       = src.zohoTld       ?? 'in';
  const pagename  = src.zohoPagename  ?? 'Careers';

  const { data } = await axios.get(
    `https://${subdomain}.zohorecruit.${tld}/recruit/v2/public/Job_Openings`,
    {
      params:  { pagename },
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      timeout: 15000,
    }
  );

  const jobs = data.data ?? [];
  if (!Array.isArray(jobs)) return [];

  return jobs
    .filter(j => j.Publish !== false && j.Is_Locked !== true)
    .map(j => normalize({
      title:      j.Posting_Title   ?? j.Job_Opening_Name ?? '',
      company:    src.company,
      location:   [j.City, j.State, j.Country].filter(Boolean).join(', '),
      department: j.Department      ?? '',
      exp:        j.Experience      ?? '',
      url:        j['$url']         ?? `https://${subdomain}.zohorecruit.${tld}/jobs/${pagename}`,
      date:       j.Date_Opened ? new Date(j.Date_Opened) : new Date(),
    }));
};
