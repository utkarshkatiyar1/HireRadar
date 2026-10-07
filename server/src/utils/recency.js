// Posted-date extraction + confidence scoring.
//
// Different source types can tell us the posting date with different reliability.
// Each extraction path stamps postedAtSource + postedAtConfidence so downstream
// ranking can trust verified dates over inferred ones.

const CONFIDENCE = {
  API:              1.0,
  JSON_LD:          0.95,
  VISIBLE_TEXT:     0.85,
  SITEMAP_LASTMOD:  0.6,
  URL_PATTERN:      0.5,
  INFERRED:         0.25,
};

// Builds the {postedAt, postedAtConfidence, postedAtSource} triple for a scraped job.
// `hint` is an optional { date, source } pair a scraper adapter may already know
// (e.g. an ATS API's own `updated_at` field is source: 'API').
const derivePostedAt = ({ hint, now = new Date() } = {}) => {
  if (hint?.date instanceof Date && !isNaN(hint.date) && hint.source && CONFIDENCE[hint.source] != null) {
    return { postedAt: hint.date, postedAtConfidence: CONFIDENCE[hint.source], postedAtSource: hint.source };
  }
  return { postedAt: now, postedAtConfidence: CONFIDENCE.INFERRED, postedAtSource: 'INFERRED' };
};

// The "effective" date used for sort ordering: verified dates win, otherwise
// fall back to when we actually discovered the job (firstSeenAt).
const effectivePostedAt = (job) => {
  if (job.postedAt && (job.postedAtConfidence ?? 0) >= 0.7) return job.postedAt;
  return job.firstSeenAt || job.firstSeen || job.date;
};

const RECENCY_BUCKETS = [
  { key: 'last-hour',    maxHours: 1 },
  { key: 'last-6-hours', maxHours: 6 },
  { key: 'today',        maxHours: 24 },
  { key: 'last-3-days',  maxHours: 72 },
  { key: 'last-7-days',  maxHours: 168 },
];

const recencyBucket = (date, now = new Date()) => {
  const hours = (now.getTime() - new Date(date).getTime()) / 36e5;
  const bucket = RECENCY_BUCKETS.find(b => hours <= b.maxHours);
  return bucket ? bucket.key : 'older';
};

module.exports = { CONFIDENCE, derivePostedAt, effectivePostedAt, recencyBucket };
