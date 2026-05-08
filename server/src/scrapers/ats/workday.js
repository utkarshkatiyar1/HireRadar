const axios     = require('axios');
const normalize = require('../../utils/normalize');

// Parses Workday's relative date strings like "Posted 3 Days Ago", "Posted Today"
const parsePostedOn = (raw) => {
  const s = (raw ?? '').replace(/posted\s*/i, '').trim().toLowerCase();
  if (!s || s === 'today') return new Date();
  const m = s.match(/(\d+)\+?\s*days?\s*ago/);
  if (m) {
    const d = new Date();
    d.setDate(d.getDate() - parseInt(m[1]));
    return d;
  }
  return new Date();
};

// Generic Workday ATS scraper.
// src must include: workdayBase, workdayTenant, workdaySite
// e.g. workdayBase = "https://apply.deloitte.com"
//      workdayTenant = "deloitte"
//      workdaySite   = "IndiaExternal"
module.exports = async (src) => {
  const { workdayBase, workdayTenant, workdaySite } = src;
  const apiBase = `${workdayBase}/wday/cxs/${workdayTenant}/${workdaySite}`;
  const jobBase = `${workdayBase}/en-US/${workdaySite}`;

  const jobs = [];
  let offset = 0;
  const limit = 20;

  while (true) {
    const { data } = await axios.post(
      `${apiBase}/jobs`,
      {
        appliedFacets: {},
        limit,
        offset,
        searchText: src.keywords[0] ?? 'react developer',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json',
        },
        timeout: 15000,
      }
    );

    const items = data.jobPostings ?? [];
    if (!items.length) break;

    for (const j of items) {
      jobs.push(normalize({
        title:    j.title ?? '',
        company:  src.company,
        location: j.locationsText ?? '',
        exp:      (j.bulletFields ?? []).join(' '),
        url:      `${jobBase}${j.externalPath ?? ''}`,
        date:     parsePostedOn(j.postedOn),
      }));
    }

    const total = data.total ?? 0;
    if (offset + limit >= total) break;
    offset += limit;
    if (offset >= 100) break;
  }

  return jobs;
};
