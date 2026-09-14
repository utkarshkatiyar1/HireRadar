module.exports = function normalize(job) {
  return {
    title:       (job.title       || '').trim(),
    company:     (job.company     || '').trim(),
    location:    (job.location    || '').trim(),
    exp:         String(job.exp   ?? '').trim(),
    department:  (job.department  || '').trim(),
    url:         (job.url         || '').trim(),
    date:        job.date instanceof Date ? job.date : new Date(job.date || Date.now()),
    // Raw JD text, when the source scraper's API returned it — see
    // scrapers/ats/{greenhouse,lever,ashby,zohorecruit}.js. Not every
    // scraper populates this (some ATS list endpoints don't include full JD
    // text; see server/src/utils/jobMatch.js's fallback for those), so this
    // is optional and left unset (not '') when the source didn't provide it.
    ...(job.description ? { description: String(job.description).trim() } : {}),
  };
};
