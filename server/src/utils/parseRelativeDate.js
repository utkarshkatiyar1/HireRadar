// Parses common "posted X ago" / "posted on <date>" visible-text patterns found
// on career pages that don't expose a structured timestamp.
// Returns a Date, or null if the text doesn't match a known pattern.
const UNIT_MS = {
  second: 1000, minute: 60_000, hour: 3_600_000,
  day: 86_400_000, week: 604_800_000, month: 2_592_000_000, year: 31_536_000_000,
};

module.exports = function parseRelativeDate(text, now = new Date()) {
  if (!text) return null;
  const t = text.toLowerCase().trim();

  if (/\b(today|just now|just posted)\b/.test(t)) return now;
  if (/\byesterday\b/.test(t)) return new Date(now.getTime() - UNIT_MS.day);

  const relative = t.match(/(\d+)\s*\+?\s*(second|minute|hour|day|week|month|year)s?\s*ago/);
  if (relative) {
    const [, amount, unit] = relative;
    return new Date(now.getTime() - Number(amount) * UNIT_MS[unit]);
  }

  // Absolute date fallback, e.g. "Posted on July 21, 2026" / "21 Jul 2026".
  const absolute = t.replace(/^posted\s*(on)?\s*/i, '');
  const parsed = new Date(absolute);
  if (!isNaN(parsed)) return parsed;

  return null;
};
