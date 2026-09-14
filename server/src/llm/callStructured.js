const Ajv = require('ajv');
const { getProvider } = require('./client');
const { assertWithinDailyLimit, recordUsage } = require('./usageLimiter');
const {
  LlmSchemaValidationError, LlmMalformedOutputError, LlmError,
} = require('./errors');

const ajv = new Ajv({ allErrors: true, strict: false });

// The single entry point every agent uses to call an LLM — never call a
// provider module directly from agent code. Handles: provider resolution,
// self-imposed daily-limit enforcement, structured-output request, AJV
// validation (independent of whatever schema conformance the provider
// itself claims — syntactically valid JSON can still be semantically wrong),
// one retry with validation feedback on failure, and usage logging.
//
// Throws (never returns invalid data):
//   LlmConfigError, LlmAuthError, LlmQuotaError, LlmProviderError,
//   LlmMalformedOutputError, LlmSchemaValidationError
async function callStructured({ stage, system, prompt, schema, model, maxRetries = 1 }) {
  const { name: providerName, generateStructured } = getProvider();
  const validate = ajv.compile(schema);

  await assertWithinDailyLimit(providerName);

  let lastError;
  let currentPrompt = prompt;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await generateStructured({ model, system, prompt: currentPrompt, schema });

      if (!validate(result)) {
        const errorSummary = ajv.errorsText(validate.errors, { separator: '; ' });
        lastError = new LlmSchemaValidationError(
          `LLM output for stage "${stage}" failed schema validation: ${errorSummary}`,
          { errors: validate.errors }
        );
        if (attempt < maxRetries) {
          // Retry once with the validation error appended — concise, not the
          // full prior response, to keep the retry cheap.
          currentPrompt = `${prompt}\n\nYour previous response did not match the required schema: ${errorSummary}. Return ONLY valid JSON matching the schema.`;
          continue;
        }
        throw lastError;
      }

      await recordUsage({ provider: providerName, model, stage, success: true });
      return result;
    } catch (err) {
      lastError = err;
      // Malformed-output retries use the same feedback loop as schema failures.
      if (err instanceof LlmMalformedOutputError && attempt < maxRetries) {
        currentPrompt = `${prompt}\n\nYour previous response was not valid JSON. Return ONLY valid JSON matching the required schema, with no extra text or markdown formatting.`;
        continue;
      }
      break;
    }
  }

  await recordUsage({
    provider: providerName, model, stage, success: false,
    errorType: lastError instanceof LlmError ? lastError.name : 'UnknownError',
  });
  throw lastError;
}

module.exports = { callStructured };
