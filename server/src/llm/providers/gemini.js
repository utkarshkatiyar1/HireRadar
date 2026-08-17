// The ONLY module in this codebase that imports @google/genai directly.
// Agents never call this file — they go through llm/callStructured.js, which
// resolves the configured provider via llm/client.js. This keeps the LLM
// layer provider-neutral: swapping providers later means adding a new file
// here, not touching any agent.
const {
  LlmConfigError, LlmAuthError, LlmQuotaError, LlmProviderError, LlmMalformedOutputError,
} = require('../errors');

let GoogleGenAI;
try {
  ({ GoogleGenAI } = require('@google/genai'));
} catch {
  GoogleGenAI = null;
}

let client;
const getClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new LlmConfigError('GEMINI_API_KEY is not set — cannot call the Gemini provider');
  }
  if (!GoogleGenAI) {
    throw new LlmConfigError('@google/genai package is not installed');
  }
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
};

// Classifies a thrown error from the SDK into one of our typed errors. The
// SDK's own error shapes aren't perfectly documented, so this is
// best-effort pattern matching on status code / message — callers should
// still treat unrecognized errors as LlmProviderError (potentially
// transient) rather than crashing the pipeline outright.
const classifyError = (err) => {
  const status = err?.status ?? err?.response?.status ?? err?.code;
  const message = String(err?.message || err);

  if (status === 401 || status === 403 || /api key not valid|permission denied/i.test(message)) {
    return new LlmAuthError(`Gemini authentication failed: ${message}`, { cause: err });
  }
  if (status === 429 || /quota|rate limit|resource_exhausted/i.test(message)) {
    return new LlmQuotaError(`Gemini quota/rate-limit exceeded: ${message}`, { cause: err });
  }
  return new LlmProviderError(`Gemini provider error: ${message}`, { cause: err });
};

// Calls Gemini with JSON-schema-constrained structured output.
// Returns the raw parsed JSON (NOT yet ajv-validated — callStructured.js
// does that independently, since Gemini's own schema conformance can still
// be semantically wrong even when syntactically valid).
async function generateStructured({ model, system, prompt, schema }) {
  const ai = getClient();

  let response;
  try {
    response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: system,
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    });
  } catch (err) {
    throw classifyError(err);
  }

  const text = response?.text;
  if (!text) {
    throw new LlmMalformedOutputError('Gemini returned an empty response');
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new LlmMalformedOutputError(`Gemini response was not valid JSON: ${err.message}`, { cause: err });
  }
}

// Returns a plain number[] embedding vector for a piece of text. Used for
// resume-to-job-description similarity (agents/resumeRouting.js) as a cheap
// deterministic-adjacent signal — no chat/JSON-schema machinery involved,
// so this is deliberately separate from generateStructured.
async function generateEmbedding({ model, text }) {
  const ai = getClient();

  let response;
  try {
    response = await ai.models.embedContent({ model, contents: text });
  } catch (err) {
    throw classifyError(err);
  }

  const values = response?.embeddings?.[0]?.values;
  if (!Array.isArray(values) || !values.length) {
    throw new LlmMalformedOutputError('Gemini returned an empty embedding');
  }
  return values;
}

module.exports = { generateStructured, generateEmbedding };
