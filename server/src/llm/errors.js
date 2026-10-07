// Typed errors for the LLM layer — callers (agents) branch on error type to
// decide whether to fall back to a deterministic result, skip the call, or
// surface a real failure. Never let a generic Error obscure which of these
// happened.
class LlmError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = this.constructor.name;
    if (cause) this.cause = cause;
  }
}

class LlmConfigError extends LlmError {} // missing/invalid provider config (e.g. no API key)
class LlmAuthError extends LlmError {}   // provider rejected credentials
class LlmQuotaError extends LlmError {}  // rate-limit/quota exhausted (HTTP 429 or provider quota signal)
class LlmProviderError extends LlmError {} // network/provider-side failure, potentially transient
class LlmMalformedOutputError extends LlmError {} // model didn't return parseable JSON at all
class LlmSchemaValidationError extends LlmError {
  constructor(message, { errors, ...rest } = {}) {
    super(message, rest);
    this.errors = errors; // ajv error array
  }
}

module.exports = {
  LlmError,
  LlmConfigError,
  LlmAuthError,
  LlmQuotaError,
  LlmProviderError,
  LlmMalformedOutputError,
  LlmSchemaValidationError,
};
