const { getProvider } = require('./client');
const { assertWithinDailyLimit, recordUsage } = require('./usageLimiter');

// Dedicated embedding model — separate from modelRouter.js's fast/quality
// chat tiers, since embeddings are a different Gemini API surface
// (ai.models.embedContent, not generateContent) with their own model name.
// NOTE: 'text-embedding-004' (the original default here) 404s against this
// API version/key — verified via ListModels that only gemini-embedding-001
// (stable) and gemini-embedding-2/-preview are available. Every embedding
// call made before this fix silently failed and fell back to keyword-only
// scoring (LlmProviderError is caught the same as a quota error by callers),
// which is why /jobs matchScores never actually reflected semantic
// similarity despite the feature being "wired up."
const EMBEDDING_MODEL = process.env.LLM_EMBEDDING_MODEL || 'gemini-embedding-001';

// The single entry point for embedding generation — mirrors callStructured.js's
// role for chat calls (provider resolution, self-imposed daily-limit
// enforcement, usage logging), so embedding calls count against the same
// LLM_DAILY_REQUEST_LIMIT and show up in the same usage accounting rather
// than being an invisible side channel.
async function embedText(text) {
  const { name: providerName, generateEmbedding } = getProvider();
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
