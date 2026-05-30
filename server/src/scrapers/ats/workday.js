const axios     = require('axios');
const normalize = require('../../utils/normalize');

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

// Some Workday instances require a CSRF token + session cookie obtained from the careers page.
async function getCsrfSession(pageUrl, ua) {
  try {
    const { data, headers } = await axios.get(pageUrl, {
      timeout: 10000,
      headers: { 'User-Agent': ua },
      maxRedirects: 5,
    });
    const cookie = (headers['set-cookie'] ?? []).map(c => c.split(';')[0]).join('; ');
    // Token may appear in HTML as a meta tag or JS variable
    const match = data.match(/["']?wd-csrf-token["']?\s*[=:]\s*["']([\w-]+)["']/i)
      ?? data.match(/csrfToken["']?\s*:\s*["']([\w-]+)["']/i);
    return { cookie, csrfToken: match?.[1] ?? null };
  } catch {
    return { cookie: '', csrfToken: null };
  }
}

// Generic Workday ATS scraper.
// src must include: workdayBase, workdayTenant, workdaySite
module.exports = async (src) => {
  const { workdayBase, workdayTenant, workdaySite } = src;
  const apiBase = `${workdayBase}/wday/cxs/${workdayTenant}/${workdaySite}`;
  const jobBase = `${workdayBase}/en-US/${workdaySite}`;
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  // Fetch CSRF token + session cookie (needed for protected boards like Visa)
  const { cookie, csrfToken } = await getCsrfSession(`${workdayBase}/${workdaySite}`, UA);

  const extraHeaders = {
    ...(cookie    ? { Cookie: cookie }               : {}),
    ...(csrfToken ? { 'X-Wd-Csrf-Token': csrfToken } : {}),
    Origin:  workdayBase,
    Referer: `${workdayBase}/${workdaySite}`,
  };

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
        searchText: src.keywords?.[0] ?? '',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': UA,
          Accept: 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          ...extraHeaders,
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
