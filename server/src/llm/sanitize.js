// Minimizes what's sent to any LLM provider. Called before every provider
// call — never send more candidate/job data than the specific stage needs.
// The free Gemini tier may have different data-handling terms than paid
// usage, so this matters beyond just token cost.

// Strips fields that must never leave this server, regardless of stage.
const NEVER_SEND_KEYS = new Set([
  'password', 'passwordHash', 'otp', 'sessionState', 'storageStatePath',
  'screenshotRef', 'idempotencyKey',
]);

function stripNeverSend(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    if (NEVER_SEND_KEYS.has(key)) continue;
    out[key] = value && typeof value === 'object' ? stripNeverSend(value) : value;
  }
  return out;
}

// Given a CandidateProfile doc, returns ONLY the facts relevant to a specific
// question — never the full profile. `relevantKeywords` is a small set of
// terms pulled from the field label/key (e.g. "react", "salary", "notice
// period") used for a simple relevance filter; callers can also pass explicit
// factIds to force-include specific facts regardless of keyword match.
function selectRelevantFacts(profile, { relevantKeywords = [], forceIncludeIds = [] } = {}) {
  if (!profile?.facts?.length) return [];
  const keywords = relevantKeywords.map(k => k.toLowerCase());
  const forceSet = new Set(forceIncludeIds);

  return profile.facts
    .filter(f => f.approved !== false)
    .filter(f => {
      if (forceSet.has(f.id)) return true;
      if (!keywords.length) return true; // no filter given — caller wants everything approved
      const haystack = `${f.id} ${f.label}`.toLowerCase();
      return keywords.some(k => haystack.includes(k));
    })
    .map(f => ({ id: f.id, label: f.label, value: f.value }));
}

// Minimal candidate summary for fit-scoring — skills + years only, not the
// full profile (no phone/links/customFacts).
function selectSkillsSummary(profile) {
  return {
    totalExpYears: profile?.totalExpYears ?? null,
    skills: (profile?.skills || []).map(s => ({ name: s.name, yearsExp: s.yearsExp })),
  };
}

// Truncates/redacts a raw job description before sending — strips anything
// that looks like a screenshot data-URI or other binary blob that shouldn't
// exist in JD text anyway.
function sanitizeJobDescription(description) {
  if (!description) return '';
  return String(description).replace(/data:[^,]+,[A-Za-z0-9+/=]{100,}/g, '[binary omitted]').slice(0, 6000);
}

module.exports = { stripNeverSend, selectRelevantFacts, selectSkillsSummary, sanitizeJobDescription };
