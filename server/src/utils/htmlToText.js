const cheerio = require('cheerio');

// Converts an ATS-supplied HTML job description into readable plain text —
// used by scrapers whose API returns rich-text HTML (Greenhouse's `content`
// field) rather than a pre-stripped plain-text field (Lever's
// `descriptionPlain`, Ashby's `descriptionPlain`, Zoho's `Job_Description`
// don't need this). Block-level elements get a trailing newline inserted
// before text extraction so paragraph/list structure survives — a bare
// `$.text()` collapses "Requirements</li><li>3+ years" into one run-on
// string, which is both unreadable and worse for embedding quality (loses
// the JD's semantic structure).
//
// Greenhouse's `content` field (verified against the live API) is
// double-encoded: the value is a *string containing* entity-escaped markup
// (literal "&lt;p&gt;...&lt;/p&gt;" text, not real <p> tags) — i.e. HTML
// that has itself been HTML-escaped once, presumably by whatever originally
// serialized it into JSON as a string. A single cheerio.load() sees only a
// text node of literal "&lt;p&gt;" characters with no real tags to parse, so
// it strips nothing. Detect that shape (a decoded pass introduces new "<...>"
// sequences that weren't in the original) and re-parse once more when it does.
function stripOnePass($html) {
  const $ = cheerio.load($html);
  $('br').replaceWith('\n');
  $('p, div, li, h1, h2, h3, h4, h5, h6, tr').each((_, el) => {
    $(el).append('\n');
  });
  return $.root().text();
}

function htmlToText(html) {
  if (!html) return '';

  let text = stripOnePass(html);
  // If the first pass's raw-text extraction still contains literal entity
  // sequences that decode into real tags, the input was double-encoded —
  // re-parse the now-decoded markup. cheerio.load() decodes entities as part
  // of parsing, so `$.text()` on the first pass already turned "&lt;p&gt;"
  // into "<p>" as plain characters; if that plain-text result itself looks
  // like HTML, run it through cheerio again to strip the real tags.
  if (/<[a-z][\s\S]*?>/i.test(text)) {
    text = stripOnePass(text);
  }

  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n\n')
    .trim();
}

module.exports = htmlToText;
