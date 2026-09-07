const axios              = require('axios');
const cheerio            = require('cheerio');
const normalize          = require('../../utils/normalize');
const parseRelativeDate  = require('../../utils/parseRelativeDate');

// Declarative generic-HTML career-page scraper.
// Adds a new company career page by CONFIG, not by writing a new JS adapter —
// deliberately avoids becoming a "magically parse any site" scraper.
//
// src.selectors must be:
//   {
//     listUrl: "https://company.com/careers",
//     selectors: {
//       jobCard:   ".job-card",           // repeated per job
//       title:     ".job-title",          // relative to jobCard
//       location:  ".location",           // relative to jobCard, optional
//       url:       "a@href",               // relative to jobCard; "@attr" reads an attribute
//       postedAt:  ".posted-date",        // relative to jobCard, optional, visible text
//     }
//   }
const readField = ($, root, sel) => {
  if (!sel) return '';
  const [cssPart, attr] = sel.split('@');
  const node = cssPart.trim() ? root.find(cssPart.trim()) : root;
  if (!node.length) return '';
  return attr ? (node.attr(attr) || '').trim() : node.first().text().trim();
};

module.exports = async (src) => {
  const config = src.selectors;
  if (!config || !config.listUrl || !config.selectors?.jobCard) {
    throw new Error(`generic-html source "${src.company}" is missing a listUrl/selectors.jobCard config`);
  }

  const { data: html } = await axios.get(config.listUrl, {
    timeout: 15000,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  const $ = cheerio.load(html);
  const { jobCard, title, location, url, postedAt } = config.selectors;

  return $(jobCard).map((_, el) => {
    const card = $(el);
    const jobTitle = readField($, card, title);
    let jobUrl = readField($, card, url);
    if (jobUrl && !/^https?:\/\//i.test(jobUrl)) {
      jobUrl = new URL(jobUrl, config.listUrl).toString();
    }
    if (!jobTitle || !jobUrl) return null;

    const postedText = readField($, card, postedAt);
    const job = normalize({
      title:      jobTitle,
      company:    src.company,
      location:   readField($, card, location),
      exp:        '',
      department: '',
      url:        jobUrl,
      date:       new Date(),
    });
    // Visible "Posted X days ago" text is lower-confidence than a structured
    // timestamp — flagged VISIBLE_TEXT rather than API/JSON_LD, and only used
    // if it actually parses to a real date (falls back to `null` = inferred).
    const parsedPostedAt = parseRelativeDate(postedText);
    job._postedAtHint = parsedPostedAt ? { date: parsedPostedAt, source: 'VISIBLE_TEXT' } : null;
    return job;
  }).get().filter(Boolean);
};
