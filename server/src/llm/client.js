const { LlmConfigError } = require('./errors');

// Resolves the configured provider module by name — the only place in the
// codebase that knows provider name -> implementation file mapping.
// Adding a second provider later means adding one entry here, not touching
// callStructured.js or any agent.
const PROVIDERS = {
  gemini: () => require('./providers/gemini'),
  voyage: () => require('./providers/voyage'),
};

function resolveProvider(name) {
  const load = PROVIDERS[name];
  if (!load) {
    throw new LlmConfigError(`Unknown provider "${name}" — supported: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return { name, ...load() };
}

function getProvider() {
  return resolveProvider(process.env.LLM_PROVIDER || 'gemini');
}

// Embeddings resolve independently of chat — LLM_EMBEDDING_PROVIDER lets
// embedText() (llm/embeddings.js) use a different provider (e.g. Voyage,
// which has no chat surface) than eligibility/fitScoring/answerAgent/etc.
// use for generateStructured, without those two concerns sharing a provider
// choice or a daily-request-limit counter.
function getEmbeddingProvider() {
  return resolveProvider(process.env.LLM_EMBEDDING_PROVIDER || process.env.LLM_PROVIDER || 'gemini');
}

module.exports = { getProvider, getEmbeddingProvider };
