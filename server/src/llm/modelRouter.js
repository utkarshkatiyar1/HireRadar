// Resolves which model a given pipeline stage should use. Configurable via
// PipelineConfig.models (DB, live-tunable) with env vars as the fallback
// default — never hardcode a model name inside an agent file.
//
// Routing rule: cheap/high-volume/deterministic-adjacent stages use the fast
// model; stages where wording quality or nuanced judgment matters use the
// quality model.
const STAGE_TIER = {
  eligibility:      'fast',
  fitScoring:       'fast',
  resumeRouting:    'fast',
  answerGeneration: 'quality',
  verifier:         'quality',
};

const resolveModel = (stage, pipelineConfig) => {
  const configured = pipelineConfig?.models?.[stage];
  if (configured) return configured;

  const tier = STAGE_TIER[stage] || 'fast';
  return tier === 'quality'
    ? (process.env.LLM_MODEL_QUALITY || 'gemini-flash-latest')
    : (process.env.LLM_MODEL_FAST || 'gemini-flash-lite-latest');
};

module.exports = { resolveModel, STAGE_TIER };
