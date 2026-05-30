const axios     = require('axios');
const normalize = require('../../utils/normalize');

// SAP SuccessFactors scraper.
// src must include: sapTenant (company tenant ID in SF)
// Optionally: sapHost ('career4.successfactors.com' | 'career5.successfactors.eu')
//
// SF exposes an undocumented search API on public career sites.
// The API endpoint varies by hosting region (US = career4, EU = career5).
module.exports = async (src) => {
  const { sapTenant, company } = src;
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  // Try both US and EU hosts
  const hosts = src.sapHost
    ? [src.sapHost]
    : ['career4.successfactors.com', 'career5.successfactors.eu'];

  for (const host of hosts) {
    const base = `https://${host}`;

    try {
      // SF public search endpoint (no auth required for public job boards)
      const { data } = await axios.get(`${base}/career`, {
        params: {
          company: sapTenant,
          lang: 'en_US',
          format: 'json',
        },
        timeout: 12000,
        headers: { 'User-Agent': UA, Accept: 'application/json, text/html' },
      });

      // Some SF instances return JSON directly
      const items = data?.jobPostings ?? data?.results ?? data?.jobs ?? [];
      if (Array.isArray(items) && items.length > 0) {
        return items.map(j => normalize({
          title:    j.title ?? j.jobTitle ?? '',
          company,
          location: j.location ?? j.city ?? '',
          url:      j.applyUrl ?? `${base}/career?company=${sapTenant}&jobId=${j.jobId}`,
          date:     j.postedDate ? new Date(j.postedDate) : new Date(),
        }));
      }

      // SF may embed job data in HTML as JSON in a script tag
      if (typeof data === 'string') {
        const match = data.match(/__INITIAL_STATE__\s*=\s*({.+?})\s*;/s)
          ?? data.match(/window\.__state\s*=\s*({.+?})\s*;/s)
          ?? data.match(/jobPostings\s*:\s*(\[.+?\])/s);

        if (match) {
          try {
            const parsed = JSON.parse(match[1]);
            const list = parsed?.jobPostings ?? parsed?.results ?? (Array.isArray(parsed) ? parsed : []);
            if (list.length > 0) {
              return list.map(j => normalize({
                title:    j.title ?? j.jobTitle ?? '',
                company,
                location: j.location ?? j.city ?? '',
                url:      j.applyUrl ?? `${base}/career?company=${sapTenant}&jobId=${j.jobId ?? j.id}`,
                date:     j.postedDate ? new Date(j.postedDate) : new Date(),
              }));
            }
          } catch { /* malformed JSON */ }
        }
      }
    } catch { /* try next host */ }
  }

  return [];
};
