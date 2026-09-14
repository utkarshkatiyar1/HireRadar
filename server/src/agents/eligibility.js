const { isLocationOk, isSenior } = require('../utils/filter');
const { callStructured } = require('../llm/callStructured');
const { resolveModel } = require('../llm/modelRouter');
const { sanitizeJobDescription } = require('../llm/sanitize');
const eligibilityPrompt = require('../llm/prompts/eligibility.prompt');
const { LlmError, LlmQuotaError } = require('../llm/errors');

// Parses an experience range/floor out of free text like "2-4 years",
// "3+ years", "minimum 5 years" — used for a deterministic experience-gap
// check so the LLM is only consulted when this can't confidently resolve.
function parseExperienceRequirement(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  const range = t.match(/(\d+)\s*[-–to]+\s*(\d+)\s*\+?\s*years?/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const plus = t.match(/(\d+)\s*\+\s*years?/);
  if (plus) return { min: Number(plus[1]), max: null };
  const minimum = t.match(/(?:minimum|at least)\s*(\d+)\s*years?/);
  if (minimum) return { min: Number(minimum[1]), max: null };
  const exact = t.match(/(\d+)\s*years?/);
  if (exact) return { min: Number(exact[1]), max: Number(exact[1]) + 1 };
  return null;
}

// Deterministic checks — no LLM cost. Reuses the existing keyword-based
// filter.js (isLocationOk/isSenior) plus an experience-range parse against
// CandidateProfile.totalExpYears. Returns { decided, passed, reasons,
// ambiguousAspects } — `decided:false` means the LLM fallback is needed.
function runDeterministicChecks(job, profile, policy) {
  const reasons = [];
  let decided = true;
  let passed = true;
  const ambiguousAspects = [];

  if (!isLocationOk(job.location)) {
    passed = false;
    reasons.push(`Location "${job.location}" not in allowed locations`);
  }

  if ((policy?.blockedLocations || []).some(loc => (job.location || '').toLowerCase().includes(loc.toLowerCase()))) {
    passed = false;
    reasons.push(`Location "${job.location}" is explicitly blocked by policy`);
  }

  if ((policy?.blockedCompanies || []).some(c => c.toLowerCase() === (job.company || '').toLowerCase())) {
    passed = false;
    reasons.push(`Company "${job.company}" is explicitly blocked by policy`);
  }

  if (isSenior(job.title)) {
    passed = false;
    reasons.push(`Title "${job.title}" matches a seniority-exclusion keyword`);
  }

  const expReq = parseExperienceRequirement(job.exp || job.title || '');
  if (expReq && profile?.totalExpYears != null) {
    const gap = expReq.min - profile.totalExpYears;
    const maxGap = policy?.maximumExperienceGapYears ?? 1;
    if (gap > maxGap) {
      passed = false;
      reasons.push(`Requires ${expReq.min}+ years, candidate has ${profile.totalExpYears} (gap ${gap} exceeds policy max ${maxGap})`);
    }
  } else if (job.exp && !expReq) {
    // Free-text experience field exists but couldn't be parsed — genuinely ambiguous.
    decided = false;
    ambiguousAspects.push(`experience requirement text: "${job.exp}"`);
  }

  return { decided, passed, reasons, ambiguousAspects };
}

// Real eligibility agent. Deterministic checks run first and, unless
// something is genuinely ambiguous, resolve the decision without any LLM
// call. The LLM fallback only ever runs for the ambiguous aspects it
// couldn't decide — never re-litigates what deterministic rules already
// settled.
module.exports = async function eligibility(_application, job, profile, policy) {
  const det = runDeterministicChecks(job, profile, policy);

  if (det.decided || !det.passed) {
    // Either fully decided, or already failed on a hard deterministic rule
    // (no need to spend an LLM call to double-check a rejection).
    return { passed: det.passed, reasons: det.reasons };
  }

  try {
    const llmResult = await callStructured({
      stage: 'eligibility',
      system: eligibilityPrompt.system,
      prompt: eligibilityPrompt.buildUserPrompt({
        jobDescriptionExcerpt: sanitizeJobDescription(job.description || `${job.title} — ${job.department || ''} — exp: ${job.exp || 'unspecified'}`),
        candidateSummary: { totalExpYears: profile?.totalExpYears ?? null },
        ambiguousAspects: det.ambiguousAspects,
      }),
      schema: eligibilityPrompt.schema,
      model: resolveModel('eligibility'),
    });
    return { passed: llmResult.passed, reasons: [...det.reasons, ...llmResult.reasons] };
  } catch (err) {
    if (err instanceof LlmQuotaError || err instanceof LlmError) {
      // Free-tier/quota unavailable. Previously this defaulted to
      // passed:true, on the reasoning that we shouldn't reject a possibly-
      // good match over an outage — but in an unattended bulk-apply flow
      // nobody reads `reasons` before the recommendation reaches
      // READY_FOR_PREPARATION, so an outage on a genuinely ambiguous
      // experience gap silently recommended jobs the candidate may not
      // qualify for at all. Fail closed instead: surface it as its own
      // reviewable state rather than a same-looking pass or an opaque
      // rejection — the caller (agents/pipeline.js) treats passed:null as
      // "needs a human, not the LLM, to decide" rather than auto-continuing.
      return {
        passed: null,
        reasons: [...det.reasons, `LLM eligibility check unavailable (${err.name}) — could not resolve ambiguous aspects: ${det.ambiguousAspects.join('; ')}`],
        llmStatus: 'SKIPPED_QUOTA',
      };
    }
    throw err;
  }
};
