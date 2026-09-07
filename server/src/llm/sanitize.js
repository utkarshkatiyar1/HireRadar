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

// Synthesizes fact-shaped entries from CandidateProfile's own typed fields
// (fullName, phone, links.*) — these were duplicated by hand into facts[]
// early on (identity.fullName, identity.phone, etc.), which meant keeping
// two copies of the same value in sync forever. The typed fields are
// themselves user-entered and therefore just as trustworthy as an approved
// fact; this derives the same stable ids from them directly so answerAgent's
// deterministic fast-path and verifier's grounding check both work against
// ONE source of truth. A real facts[] entry with the same id always wins
// (someone may deliberately want a different value answered for a specific
// field), so this only fills in what facts[] doesn't already have.
function deriveIdentityFacts(profile) {
  const derived = [];
  if (profile?.fullName) derived.push({ id: 'identity.fullName', label: 'Full name', value: profile.fullName, approved: true });
  // preferredName falls back to fullName's first token when unset (e.g.
  // "Utkarsh Katiyar" -> "Utkarsh") rather than staying blank — a real
  // incident: "Preferred Name" fields came back "left blank — no matching
  // fact" even though the obvious, correct answer is just the candidate's
  // first name. An explicit profile.preferredName always wins if set (some
  // people go by something other than their first name).
  const preferredName = profile?.preferredName || profile?.fullName?.trim().split(/\s+/)[0];
  if (preferredName) derived.push({ id: 'identity.preferredName', label: 'Preferred name', value: preferredName, approved: true });
  if (profile?.phone)    derived.push({ id: 'identity.phone',    label: 'Phone',     value: profile.phone,    approved: true });
  if (profile?.country)  derived.push({ id: 'identity.country',  label: 'Country',   value: profile.country,  approved: true });
  if (profile?.links?.linkedin)  derived.push({ id: 'identity.linkedin',  label: 'LinkedIn',  value: profile.links.linkedin,  approved: true });
  if (profile?.links?.github)    derived.push({ id: 'identity.github',    label: 'GitHub',    value: profile.links.github,    approved: true });
  if (profile?.links?.portfolio) derived.push({ id: 'identity.portfolio', label: 'Portfolio', value: profile.links.portfolio, approved: true });
  // Still filled from a real, user-entered field — PipelineConfig's
  // alwaysManualFields (work_authorization) forces MANUAL confidenceTier
  // regardless of this, so it's still gated for human review before
  // submission; this just means the draft answer itself isn't blank.
  if (profile?.workAuthorization) derived.push({ id: 'identity.workAuthorization', label: 'Work authorization', value: profile.workAuthorization, approved: true });
  // requiresVisaSponsorship is a real tri-state (true/false/unset) — only
  // derive a fact when the user has actually stated it (!= null/undefined).
  // Never defaulted to a fixed value; see candidateProfile.js's schema
  // comment for why. Same MANUAL-tier gate as workAuthorization above.
  if (profile?.requiresVisaSponsorship != null) {
    derived.push({
      id: 'identity.requiresVisaSponsorship',
      label: 'Requires visa sponsorship',
      value: profile.requiresVisaSponsorship ? 'Yes' : 'No',
      approved: true,
    });
  }
  // Distinct fact from requiresVisaSponsorship — see candidateProfile.js's
  // schema comment for why these are never derived from one another.
  if (profile?.currentlyEligibleToWork != null) {
    derived.push({
      id: 'identity.currentlyEligibleToWork',
      label: 'Currently eligible to work',
      value: profile.currentlyEligibleToWork ? 'Yes' : 'No',
      approved: true,
    });
  }
  return derived;
}

// Merges real facts[] with the synthesized identity facts above — a real
// facts[] entry for a given id always takes precedence over the derived one.
function factsWithDerivedIdentity(profile) {
  const real = profile?.facts || [];
  const realIds = new Set(real.map(f => f.id));
  const derived = deriveIdentityFacts(profile).filter(f => !realIds.has(f.id));
  return [...real, ...derived];
}

// Given a CandidateProfile doc, returns ONLY the facts relevant to a specific
// question — never the full profile. `relevantKeywords` is a small set of
// terms pulled from the field label/key (e.g. "react", "salary", "notice
// period") used for a simple relevance filter; callers can also pass explicit
// factIds to force-include specific facts regardless of keyword match.
function selectRelevantFacts(profile, { relevantKeywords = [], forceIncludeIds = [] } = {}) {
  const allFacts = factsWithDerivedIdentity(profile);
  if (!allFacts.length) return [];
  const keywords = relevantKeywords.map(k => k.toLowerCase());
  const forceSet = new Set(forceIncludeIds);

  return allFacts
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

module.exports = { stripNeverSend, selectRelevantFacts, selectSkillsSummary, sanitizeJobDescription, deriveIdentityFacts, factsWithDerivedIdentity };
