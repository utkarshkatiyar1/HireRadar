const { getEmbeddingProvider } = require('./client');
const { assertWithinDailyLimit, recordUsage } = require('./usageLimiter');

// Dedicated embedding model — independent of modelRouter.js's fast/quality
// chat tiers AND of whichever provider LLM_PROVIDER picks for chat, since
// LLM_EMBEDDING_PROVIDER can point embeddings at an entirely different
// provider (see client.js's getEmbeddingProvider). Defaults to Voyage's
// voyage-3-lite now that embeddings run through Voyage instead of Gemini —
// generous free-tier token budget instead of Gemini's shared, easily
// exhausted daily request quota (see usageLimiter.js).
//
// NOTE: while embeddings still ran through Gemini, 'text-embedding-004' (the
// original default here) 404'd against that API version/key — only
// gemini-embedding-001 (stable) and gemini-embedding-2/-preview worked. Every
// embedding call made before that fix silently failed and fell back to
// keyword-only scoring (LlmProviderError is caught the same as a quota error
// by callers), which is why /jobs matchScores never actually reflected
// semantic similarity despite the feature being "wired up."
const EMBEDDING_MODEL = process.env.LLM_EMBEDDING_MODEL || 'voyage-3-lite';

// The single entry point for embedding generation — mirrors callStructured.js's
// role for chat calls (provider resolution, self-imposed daily-limit
// enforcement, usage logging). Usage is tracked per-provider (see
// usageLimiter.js), so Voyage embedding calls no longer contend with
// Gemini's LLM_DAILY_REQUEST_LIMIT the way they did when both ran through
// the same provider.
async function embedText(text) {
  const { name: providerName, generateEmbedding } = getEmbeddingProvider();
  await assertWithinDailyLimit(providerName);

  try {
    const values = await generateEmbedding({ model: EMBEDDING_MODEL, text });
    await recordUsage({ provider: providerName, model: EMBEDDING_MODEL, stage: 'embedding', success: true });
    return values;
  } catch (err) {
    await recordUsage({
      provider: providerName, model: EMBEDDING_MODEL, stage: 'embedding', success: false,
      errorType: err?.name || 'UnknownError',
    });
    throw err;
  }
}

// Cosine similarity between two equal-length embedding vectors — in-memory,
// no vector DB needed. Fine at this scale (comparing a handful of resume
// variants against one job description at a time); pgvector/a real vector
// store would only start paying for itself with far more variants than a
// solo user's ResumeVariant collection ever holds.
function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

module.exports = { embedText, cosineSimilarity, EMBEDDING_MODEL };
