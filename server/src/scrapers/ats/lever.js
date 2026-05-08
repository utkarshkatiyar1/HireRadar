const axios     = require('axios');
const normalize = require('../../utils/normalize');

// Generic Lever ATS scraper (public postings API — no auth required).
// src must include: leverToken
// Find token: open DevTools on company careers page → Network → filter "lever.co"
// URL pattern: api.lever.co/v0/postings/{token}
module.exports = async (src) => {
  const { data } = await axios.get(
    `https://api.lever.co/v0/postings/${src.leverToken}`,
    {
      params: { mode: 'json' },
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }
  );

  return (Array.isArray(data) ? data : []).map(j => normalize({
    title:      j.text ?? '',
    company:    src.company,
    location:   j.categories?.location ?? '',
    exp:        j.categories?.commitment ?? '',
    department: j.categories?.team ?? '',
    url:        j.hostedUrl ?? j.applyUrl ?? '',
    date:       new Date(j.createdAt ?? Date.now()),
  }));
};
