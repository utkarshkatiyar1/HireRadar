const crypto = require('crypto');

// Job identity/content hashing for dedup + repost detection.
//
// identityHash: stable across minor JD edits (company+title+location+department).
//   Used to recognise "the same role" even if the description text changes.
// contentHash: fingerprints the JD body itself.
//   Used to detect whether a role's content actually changed (repost/refresh)
//   vs. is byte-identical to what we already have.
//
// Repost logic (applied by the caller against the existing Job doc):
//   same identityHash + same contentHash  -> duplicate, no-op
//   same identityHash + changed contentHash -> REFRESHED (update refreshedAt)
//   no existing identityHash match -> new job

const normalizeText = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const hash = (input) => crypto.createHash('sha256').update(input).digest('hex');

const identityHash = (job) => {
  const parts = [
    normalizeText(job.company),
    normalizeText(job.title),
    normalizeText(job.location),
    normalizeText(job.department),
  ];
  return hash(parts.join('|'));
};

const contentHash = (job) => {
  // Fall back to title when description is absent (most existing scrapers don't
  // populate it yet) so the hash is still meaningful rather than a constant.
  const body = job.description && job.description.trim() ? job.description : job.title;
  return hash(normalizeText(body));
};

module.exports = { normalizeText, hash, identityHash, contentHash };
