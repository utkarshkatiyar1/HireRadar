// Embeddings-only provider — Voyage AI has no chat/generateContent surface,
// so generateStructured is intentionally absent. This is only ever resolved
// via the embedding-specific provider lookup in client.js
// (getEmbeddingProvider), never via getProvider(), so callStructured.js can
// never accidentally route a chat call here.
const {
  LlmConfigError, LlmAuthError, LlmQuotaError, LlmProviderError, LlmMalformedOutputError,
} = require('../errors');
const { throttle } = require('../rateLimiter');

const API_URL = 'https://api.voyageai.com/v1/embeddings';

// Voyage accounts without a payment method on file are capped at 3 RPM /
// 10K TPM (returned as an x-api-warning header, not a documented rate-limit
// header) — see docs.voyageai.com/docs/pricing. Defaults to that unverified
// tier's ceiling so we pace correctly out of the box; bump VOYAGE_RPM once a
// payment method is added and Voyage confirms the higher limit (their free
// 200M-token budget still applies either way, so this stays $0 either way).
const RPM = Number(process.env.VOYAGE_RPM) || 3;
const MIN_INTERVAL_MS = 60_000 / RPM;

// Retry-with-backoff on a real 429 — this is the backstop for whatever the
// in-process pacing above can't cover (bursts from concurrent workers
// sharing this one account's limit across separate OS processes; see
// rateLimiter.js's caveat that it only paces within a single process).
const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 5_000;

const classifyError = (status, body) => {
  const message = body?.detail || body?.error || JSON.stringify(body);

  if (status === 401 || status === 403) {
    return new LlmAuthError(`Voyage authentication failed: ${message}`);
  }
  if (status === 429) {
    return new LlmQuotaError(`Voyage quota/rate-limit exceeded: ${message}`);
  }
  return new LlmProviderError(`Voyage provider error (${status}): ${message}`);
};

async function callVoyage(apiKey, model, text) {
  let response, body;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: text, model, input_type: 'document' }),
    });
    body = await response.json().catch(() => null);
  } catch (err) {
    throw new LlmProviderError(`Voyage request failed: ${err.message}`, { cause: err });
  }

  if (!response.ok) {
    throw classifyError(response.status, body);
  }

  const values = body?.data?.[0]?.embedding;
  if (!Array.isArray(values) || !values.length) {
    throw new LlmMalformedOutputError('Voyage returned an empty embedding');
  }
  return values;
}

// Returns a plain number[] embedding vector for a piece of text — same
// shape as providers/gemini.js's generateEmbedding, so embeddings.js and
// jobMatch.js/cosineSimilarity don't need to know which provider produced it.
async function generateEmbedding({ model, text }) {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new LlmConfigError('VOYAGE_API_KEY is not set — cannot call the Voyage provider');
  }

  for (let attempt = 0; ; attempt++) {
    await throttle('voyage', MIN_INTERVAL_MS);
    try {
      return await callVoyage(apiKey, model, text);
    } catch (err) {
      const isLastAttempt = attempt >= MAX_RETRIES;
      if (!(err instanceof LlmQuotaError) || isLastAttempt) throw err;
      await new Promise((r) => setTimeout(r, BASE_BACKOFF_MS * 2 ** attempt));
    }
  }
}

module.exports = { generateEmbedding };
