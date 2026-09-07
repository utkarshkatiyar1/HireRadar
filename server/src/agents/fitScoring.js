const { callStructured } = require('../llm/callStructured');
const { resolveModel } = require('../llm/modelRouter');
const { sanitizeJobDescription, selectSkillsSummary } = require('../llm/sanitize');
const { keywordSkillMatch, semanticSkillMatch, EMBEDDING_FLOOR } = require('../utils/jobMatch');
const fitScoringPrompt = require('../llm/prompts/fitScoring.prompt');
const { LlmError, LlmQuotaError } = require('../llm/errors');

// Deterministic base score (0-100 scale), blending the keyword skill match
// with an embedding-based semantic similarity score when available.
// `semanticScore` (0-100 or null) is blended in alongside the keyword score
// rather than replacing it — keyword matching catches exact terms embeddings
// can blur past (e.g. a hard "React" requirement), while embeddings catch
// paraphrased/related skills keyword matching misses.
function deterministicBaseScore(job, profile, keywordScore, semanticScore) {
  const skillMatch = semanticScore == null
    ? keywordScore
    : Math.round(keywordScore * 0.5 + semanticScore * 0.5);

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
    rationale: semanticScore == null
      ? 'deterministic keyword-based score'
      : 'deterministic score blending keyword match with embedding-based semantic similarity',
  };
}

const PLAUSIBLE_THRESHOLD = 40; // below this, an LLM refinement pass isn't worth the call

// Real fit-scoring agent. Always computes a deterministic base score first
// (cheap, no LLM). The embedding call only runs once the keyword score clears
// a low floor — a job scoring near-zero on keywords isn't worth a semantic
// check — and the LLM refinement only runs if the blended score then clears
// the higher plausibility threshold, same cost-gating shape as before.
module.exports = async function fitScoring(_application, job, profile) {
  const keywordScore = keywordSkillMatch(job);

  let semanticScore = null;
  if (keywordScore >= EMBEDDING_FLOOR) {
    try {
      semanticScore = await semanticSkillMatch(job, profile);
    } catch (err) {
      if (!(err instanceof LlmQuotaError || err instanceof LlmError)) throw err;
      // Quota/provider outage on the embedding call — fall back to keyword-only,
      // same posture as the LLM-refinement fallback below.
    }
  }

  const base = deterministicBaseScore(job, profile, keywordScore, semanticScore);

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
