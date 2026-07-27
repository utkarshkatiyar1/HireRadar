const { callStructured } = require('../llm/callStructured');
const { resolveModel } = require('../llm/modelRouter');
const { selectRelevantFacts, factsWithDerivedIdentity } = require('../llm/sanitize');
const answerAgentPrompt = require('../llm/prompts/answerAgent.prompt');
const { LlmError, LlmQuotaError } = require('../llm/errors');

// Extracts a few keywords from a field label to scope which facts get sent —
// never send the full CandidateProfile for a single field's answer.
function keywordsFromLabel(label) {
  return (label || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
}

// Deterministic fast-path — a small set of well-known, unambiguous fields
// (name/email/phone/links) are exact-match lookups against a single fact,
// not something that benefits from LLM judgment. Skipping the LLM here
// keeps quota for fields that genuinely need reasoning (free-text questions,
// anything combining multiple facts), and means "what's the candidate's
// email" never goes unanswered just because the daily LLM cap was hit by
// unrelated fit-scoring calls earlier the same day.
// Each matcher tests the field's label+key together; first match wins.
const DETERMINISTIC_FIELD_MATCHERS = [
  { factId: 'identity.email',     test: /\bemail\b/i },
  { factId: 'identity.phone',     test: /\bphone\b|\bmobile\b|\bcontact number\b/i },
  { factId: 'identity.linkedin',  test: /\blinkedin\b/i },
  { factId: 'identity.github',    test: /\bgithub\b/i },
  { factId: 'identity.portfolio', test: /\bportfolio\b|\bwebsite\b|\bpersonal site\b/i },
];

// Full name needs splitting for First/Last/Preferred-name fields — handled
// separately since it's derived from one fact rather than a direct 1:1 copy.
const FIRST_NAME_TEST = /\bfirst name\b|\bpreferred first name\b|\bgiven name\b/i;
const LAST_NAME_TEST  = /\blast name\b|\bsurname\b|\bfamily name\b/i;
const FULL_NAME_TEST  = /\bfull name\b|\byour name\b/i;

// Returns { value, factIds, confidence } if this field can be answered
// deterministically, or null if it needs the LLM (or has no match at all).
function tryDeterministicAnswer(field, profile) {
  const haystack = `${field.label || ''} ${field.key || ''}`;
  // Includes facts derived from profile.fullName/phone/links.* so these
  // never need to be duplicated by hand into facts[] — see sanitize.js's
  // deriveIdentityFacts for why.
  const factsById = new Map(factsWithDerivedIdentity(profile).map(f => [f.id, f]));

  const fullNameFact = factsById.get('identity.fullName');
  if (fullNameFact?.approved !== false && fullNameFact?.value) {
    const parts = fullNameFact.value.trim().split(/\s+/);
    if (FIRST_NAME_TEST.test(haystack)) {
      return { value: parts[0], factIds: ['identity.fullName'], confidence: 100 };
    }
    if (LAST_NAME_TEST.test(haystack) && parts.length > 1) {
      return { value: parts.slice(1).join(' '), factIds: ['identity.fullName'], confidence: 100 };
    }
    if (FULL_NAME_TEST.test(haystack)) {
      return { value: fullNameFact.value, factIds: ['identity.fullName'], confidence: 100 };
    }
  }

  for (const { factId, test } of DETERMINISTIC_FIELD_MATCHERS) {
    if (!test.test(haystack)) continue;
    const fact = factsById.get(factId);
    if (fact?.approved !== false && fact?.value) {
      return { value: fact.value, factIds: [factId], confidence: 100 };
    }
  }

  return null;
}

// Real answer agent. Called once per form field, ONLY from the explicit
// prepare flow (never automatically for every recommended job — see
// agents/pipeline.js's runPreparation, invoked by POST /applications/:id/prepare).
// Sends only the facts relevant to THIS field, not the whole truth store.
module.exports = async function answerAgent(_job, profile, formFields) {
  const answers = [];

  for (const field of formFields) {
    // Deterministic fast-path first — name/email/phone/links are exact-match
    // lookups, not something an LLM call adds value to. Also means these
    // never go unanswered just because unrelated LLM usage (e.g. bulk
    // fit-scoring) used up the day's self-imposed quota.
    const deterministic = tryDeterministicAnswer(field, profile);
    if (deterministic) {
      answers.push({
        fieldKey: field.key,
        fieldLabel: field.label,
        value: deterministic.value,
        factIds: deterministic.factIds,
        confidence: deterministic.confidence,
        source: 'truth_store',
      });
      continue;
    }

    // neverAnswerFields (ApplicationPolicy) are excluded entirely — not even
    // drafted, so there's nothing to accidentally leak or auto-fill later.
    const relevantFacts = selectRelevantFacts(profile, { relevantKeywords: keywordsFromLabel(field.label) });

    if (!relevantFacts.length) {
      // No matching fact at all — never guess. Confidence 0 forces MANUAL tier.
      answers.push({ fieldKey: field.key, fieldLabel: field.label, value: null, factIds: [], confidence: 0, source: 'truth_store' });
      continue;
    }

    try {
      const llmResult = await callStructured({
        stage: 'answerGeneration',
        system: answerAgentPrompt.system,
        prompt: answerAgentPrompt.buildUserPrompt({
          fieldLabel: field.label,
          fieldType: field.fieldType || field.type,
          relevantFacts,
        }),
        schema: answerAgentPrompt.schema,
        model: resolveModel('answerGeneration'),
      });
      answers.push({
        fieldKey: field.key,
        fieldLabel: field.label,
        value: llmResult.value,
        factIds: llmResult.factIds,
        confidence: llmResult.confidence,
        source: llmResult.value ? 'truth_store' : 'inferred',
      });
    } catch (err) {
      if (err instanceof LlmQuotaError || err instanceof LlmError) {
        // LLM unavailable — never fabricate an answer to keep the pipeline
        // moving. Leave it unanswered (confidence 0, forces MANUAL tier) so
        // a human fills it in, rather than guessing.
        answers.push({
          fieldKey: field.key, fieldLabel: field.label, value: null, factIds: [], confidence: 0,
          source: 'truth_store', llmStatus: 'SKIPPED_QUOTA',
        });
        continue;
      }
      throw err;
    }
  }

  return answers;
};
