const { LlmConfigError } = require('./errors');

// Resolves the configured provider module by name — the only place in the
// codebase that knows provider name -> implementation file mapping.
// Adding a second provider later means adding one entry here, not touching
// callStructured.js or any agent.
const PROVIDERS = {
  gemini: () => require('./providers/gemini'),
};

function getProvider() {
  const name = process.env.LLM_PROVIDER || 'gemini';
  const load = PROVIDERS[name];
  if (!load) {
    throw new LlmConfigError(`Unknown LLM_PROVIDER "${name}" — supported: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return { name, ...load() };
}

module.exports = { getProvider };
