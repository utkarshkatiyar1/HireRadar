const { callStructured } = require('../llm/callStructured');
const { resolveModel } = require('../llm/modelRouter');
const { sanitizeJobDescription } = require('../llm/sanitize');
const resumeRoutingPrompt = require('../llm/prompts/resumeRouting.prompt');
const { LlmError, LlmQuotaError } = require('../llm/errors');

// Deterministic tag-overlap score: counts how many of a resume variant's
// tags appear in the job's title/department text.
function tagOverlapScore(variant, job) {
  const text = `${job.title} ${job.department || ''}`.toLowerCase();
  return (variant.tags || []).filter(tag => text.includes(tag.toLowerCase())).length;
}

// Real resume-routing agent. Ranks variants by deterministic tag overlap.
// Only calls the LLM to break a tie between the top-scoring variants — a
// clear deterministic winner never touches the LLM.
module.exports = async function resumeRouting(job, resumeVariants) {
  if (!resumeVariants.length) {
    return { resumeVariantId: null, rationale: 'no resume variants available' };
  }

  const scored = resumeVariants
    .map(v => ({ variant: v, score: tagOverlapScore(v, job) }))
    .sort((a, b) => b.score - a.score);

  const topScore = scored[0].score;
  const tied = scored.filter(s => s.score === topScore).map(s => s.variant);

  if (tied.length === 1) {
    const defaultAmongTied = tied.find(v => v.isDefault) || tied[0];
    return { resumeVariantId: defaultAmongTied._id, rationale: `deterministic tag-overlap winner (score ${topScore})` };
  }

  // Prefer isDefault among ties before ever spending an LLM call.
  const defaultTied = tied.find(v => v.isDefault);
  if (defaultTied) {
    return { resumeVariantId: defaultTied._id, rationale: `tied on tag overlap (score ${topScore}), broke tie via isDefault` };
  }

  try {
    const llmResult = await callStructured({
      stage: 'resumeRouting',
      system: resumeRoutingPrompt.system,
      prompt: resumeRoutingPrompt.buildUserPrompt({
        jobDescriptionExcerpt: sanitizeJobDescription(job.description || `${job.title} — ${job.department || ''}`),
        tiedVariants: tied,
      }),
      schema: resumeRoutingPrompt.schema,
      model: resolveModel('resumeRouting'),
    });
    const chosen = tied.find(v => v.label === llmResult.chosenLabel) || tied[0];
    return { resumeVariantId: chosen._id, rationale: llmResult.rationale };
  } catch (err) {
    if (err instanceof LlmQuotaError || err instanceof LlmError) {
      return { resumeVariantId: tied[0]._id, rationale: `LLM tie-break skipped (${err.name}) — picked first tied variant`, llmStatus: 'SKIPPED_QUOTA' };
    }
    throw err;
  }
};
