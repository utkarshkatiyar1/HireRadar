const axios     = require('axios');
const cheerio    = require('cheerio');
const normalize  = require('../../utils/normalize');

// Generic JobPosting JSON-LD scraper.
// Visits a career-page listing URL, follows individual job links (or reads a
// single listing page directly), and extracts <script type="application/ld+json">
// blocks matching schema.org JobPosting.
//
// src must include: listUrl (the careers page to scan for JobPosting JSON-LD)
// Optional: jobLinkSelector (CSS selector for anchor tags to individual job pages,
// used when the listing page itself has no JSON-LD but linked job pages do).
module.exports = async (src) => {
  const { data: html } = await axios.get(src.listUrl, {
    timeout: 15000,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  const $ = cheerio.load(html);
  const jobs = [];

  const extractFromDoc = (doc, pageUrl) => {
    const blocks = doc('script[type="application/ld+json"]').toArray();
    for (const el of blocks) {
      let parsed;
      try {
        parsed = JSON.parse(doc(el).contents().text());
      } catch {
        continue;
      }
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const c of candidates) {
        if (!c || c['@type'] !== 'JobPosting') continue;
        jobs.push(normalize({
          title:      c.title || '',
          company:    src.company,
          location:   c.jobLocation?.address?.addressLocality
            || c.jobLocation?.address?.addressRegion
            || c.applicantLocationRequirements?.name
            || '',
          exp:        '',
          department: c.occupationalCategory || '',
          url:        c.url || pageUrl,
          date:       new Date(c.datePosted || Date.now()),
        }));
        // Preserve raw JD text + verified posting date for the recency/agent pipeline.
        jobs[jobs.length - 1].description = (c.description || '').replace(/<[^>]+>/g, ' ').trim();
        jobs[jobs.length - 1]._postedAtHint = c.datePosted ? { date: new Date(c.datePosted), source: 'JSON_LD' } : null;
      }
    }
  };

  // Listing page itself may carry JSON-LD (common for single-role pages, or an
  // ItemList of JobPostings).
  extractFromDoc($, src.listUrl);

  // If a link selector is configured and nothing was found directly, follow
  // individual job links and extract per-page.
  if (!jobs.length && src.jobLinkSelector) {
    const links = $(src.jobLinkSelector)
      .map((_, el) => $(el).attr('href'))
      .get()
      .filter(Boolean)
      .map(href => new URL(href, src.listUrl).toString());

    for (const link of links.slice(0, 200)) {
      try {
        const { data: jobHtml } = await axios.get(link, {
          timeout: 15000,
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        extractFromDoc(cheerio.load(jobHtml), link);
      } catch {
        // one broken job page shouldn't abort the whole source
      }
    }
  }

  return jobs;
};
