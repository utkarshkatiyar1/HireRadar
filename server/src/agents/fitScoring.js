const { scoreJob, DEFAULTS } = require('../utils/filter');
const { callStructured } = require('../llm/callStructured');
const { resolveModel } = require('../llm/modelRouter');
const { sanitizeJobDescription, selectSkillsSummary } = require('../llm/sanitize');
const fitScoringPrompt = require('../llm/prompts/fitScoring.prompt');
const { LlmError, LlmQuotaError } = require('../llm/errors');

// Deterministic base score (0-100 scale) derived from the existing keyword
// scoring in filter.js, which returns an unbounded additive score — this
// clamps/maps it onto the same 0-100 scale the pipeline's fitScore uses.
function deterministicBaseScore(job, profile) {
  const raw = scoreJob(job, DEFAULTS); // roughly -9..+9 in practice
  const skillMatch = Math.max(0, Math.min(100, 50 + raw * 6));

  let expGap = 70;
  if (profile?.totalExpYears != null && job.exp) {
    const parsed = job.exp.match(/(\d+)/);
    if (parsed) {
      const gap = Number(parsed[1]) - profile.totalExpYears;
      expGap = gap <= 0 ? 90 : Math.max(10, 90 - gap * 20);
    }
  }

  const total = Math.round((skillMatch + expGap) / 2);
  return {
    total,
    breakdown: { skillMatch, evidenceStrength: skillMatch, expGap, companyQuality: 50, salaryPotential: 50, effort: 50 },
    rationale: 'deterministic keyword-based score',
  };
}

const PLAUSIBLE_THRESHOLD = 40; // below this, an LLM refinement pass isn't worth the call

// Real fit-scoring agent. Always computes a deterministic base score first
// (cheap, no LLM). Only calls the semantic LLM refinement for candidates
// that clear a plausibility floor — a job scoring 5/100 deterministically
// isn't worth spending a call on to see if it's secretly a good match.
module.exports = async function fitScoring(_application, job, profile) {
  const base = deterministicBaseScore(job, profile);

  if (base.total < PLAUSIBLE_THRESHOLD) {
    return { ...base, scoredAt: new Date() };
  }

  try {
    const llmResult = await callStructured({
      stage: 'fitScoring',
      system: fitScoringPrompt.system,
      prompt: fitScoringPrompt.buildUserPrompt({
        jobDescriptionExcerpt: sanitizeJobDescription(job.description || `${job.title} — ${job.department || ''}`),
        candidateSkillsSummary: selectSkillsSummary(profile),
        deterministicBaseScore: base,
      }),
      schema: fitScoringPrompt.schema,
      model: resolveModel('fitScoring'),
    });
    return {
      total: llmResult.total,
      breakdown: {
        skillMatch: llmResult.skillMatch,
        evidenceStrength: llmResult.evidenceStrength,
        expGap: llmResult.expGap,
        companyQuality: llmResult.companyQuality,
        salaryPotential: llmResult.salaryPotential,
        effort: llmResult.effort,
      },
      rationale: llmResult.rationale,
      scoredAt: new Date(),
    };
  } catch (err) {
    if (err instanceof LlmQuotaError || err instanceof LlmError) {
      // Free-tier/quota unavailable — keep the deterministic score rather
      // than failing the application.
      return { ...base, scoredAt: new Date(), llmStatus: 'SKIPPED_QUOTA' };
    }
    throw err;
  }
};
