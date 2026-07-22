const LlmUsage = require('../models/llmUsage');
const { LlmQuotaError } = require('./errors');

const todayUTC = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// Enforces LLM_DAILY_REQUEST_LIMIT ourselves rather than relying solely on
// the provider's own free-tier limit — we want to stop cleanly before
// hitting a 429, not discover the boundary via a failed call. Throws
// LlmQuotaError (same type callStructured.js already handles) so callers
// treat "we chose to stop" identically to "the provider stopped us".
async function assertWithinDailyLimit(provider) {
  const limit = Number(process.env.LLM_DAILY_REQUEST_LIMIT);
  if (!limit || limit <= 0) return; // unset/0 = no self-imposed cap (provider's own limit still applies)

  const count = await LlmUsage.countDocuments({ date: todayUTC(), provider });
  if (count >= limit) {
    throw new LlmQuotaError(`Self-imposed daily LLM request limit reached (${count}/${limit} for ${provider})`);
  }
}

// Records one call's outcome — fire-and-forget from the caller's perspective
// (a logging failure must never fail the actual LLM call it's describing).
async function recordUsage({ provider, model, stage, success, errorType, estimatedInputTokens = 0, estimatedOutputTokens = 0 }) {
  try {
    await LlmUsage.create({
      date: todayUTC(), provider, model, stage, success, errorType,
      estimatedInputTokens, estimatedOutputTokens,
    });
  } catch {
    // never let usage logging break the pipeline
  }
}

module.exports = { assertWithinDailyLimit, recordUsage, todayUTC };
