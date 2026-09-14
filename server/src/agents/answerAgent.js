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
  // "Country" is a near-universal field on Greenhouse/Lever/Ashby forms
  // (distinct from "Location (City)") — previously had NO source at all,
  // always came back "left blank — no matching fact" even when the
  // candidate's country is obviously knowable. Ordered before
  // PREFERRED_NAME_TEST/etc below since it must run regardless of fullName
  // presence.
  { factId: 'identity.country',   test: /\bcountry\b/i },
  // Explicit fact, never a policy default — see candidateProfile.js's
  // schema comment for why "always answer No" specifically was rejected as
  // an approach. Still forces MANUAL tier via computeTier.js's
  // SENSITIVE_LABEL_PATTERNS regardless of this answering cleanly.
  { factId: 'identity.requiresVisaSponsorship', test: /\bvisa\b|\bsponsorship\b/i },
  // Distinct question from visa sponsorship above — "are you eligible to
  // work" / "authorized to work" without mentioning visa/sponsorship at all
  // (e.g. Bloomreach's Greenhouse form asks both as separate questions).
  // Ordered AFTER the visa/sponsorship matcher since some phrasings overlap
  // both words ("work authorization" forms can mention "eligible" too) —
  // first match wins, and the more specific visa/sponsorship wording should
  // take precedence when both patterns could apply.
  { factId: 'identity.currentlyEligibleToWork', test: /\beligible to work\b|\bauthorized to work\b|\bright to work\b|\blegally (able|allowed) to work\b/i },
];

// Full name needs splitting for First/Last/Preferred-name fields — handled
// separately since it's derived from one fact rather than a direct 1:1 copy.
// PREFERRED_NAME_TEST checked separately (not folded into FIRST_NAME_TEST)
// since it resolves against identity.preferredName specifically — which
// falls back to fullName's first token only when no distinct preferredName
// is set (see sanitize.js's deriveIdentityFacts) — not straight off
// fullName the way a literal "First Name" field should.
const PREFERRED_NAME_TEST = /\bpreferred name\b|\bpreferred first name\b|\bnickname\b|\bgo(es)? by\b/i;
const FIRST_NAME_TEST = /\bfirst name\b|\bgiven name\b/i;
const LAST_NAME_TEST  = /\blast name\b|\bsurname\b|\bfamily name\b/i;
const FULL_NAME_TEST  = /\bfull name\b|\byour name\b/i;

// Data-processing/EEO-survey consent checkboxes — "By checking this box, I
// consent to [Company] collecting, storing, and processing my responses..."
// This is a legal-consent decision, not a fact lookup, so it's resolved from
// ApplicationPolicy.autoConsentToDataProcessing (explicit opt-in, defaults
// false) rather than ever asking the LLM to decide on the candidate's
// behalf. Deliberately narrow — matches consent/data-processing language
// specifically, not every checkbox (a "select all that apply" multi-select
// checkbox must NOT be swept into this path).
const CONSENT_CHECKBOX_TEST = /\bconsent\b.*\b(collect|stor|process)|\bi agree\b.*\b(privacy|data|process)|\bagree to (the )?(privacy|terms)/i;

// "Where did you hear about [Company]?" / "How did you hear about this
// opportunity/role?" — near-universal marketing-attribution question,
// resolved from ApplicationPolicy.sourceAttributionAnswer (explicit opt-in,
// same reasoning as the consent checkbox above, just not sensitive enough
// to need the same scrutiny). Deliberately does NOT match "how did you hear
// about THIS ROLE specifically" phrasing that might expect a different
// kind of answer (e.g. a specific job posting's source) — narrowed to
// "hear about" + a company-name-shaped or generic "us/opportunity" object.
const SOURCE_ATTRIBUTION_TEST = /\bhear about\b|\bhow did you find\b|\bwhere did you (learn|discover)\b/i;

// Returns { value, factIds, confidence } if this field can be answered
// deterministically, or null if it needs the LLM (or has no match at all).
function tryDeterministicAnswer(field, profile, policy) {
  const haystack = `${field.label || ''} ${field.key || ''}`;

  if ((field.fieldType === 'checkbox') && CONSENT_CHECKBOX_TEST.test(haystack)) {
    // No factIds — this isn't grounded in a candidate fact, it's a policy
    // decision. confidence 100 either way since the policy value itself is
    // an explicit, unambiguous user choice, not something to route to
    // MANUAL for lack of evidence.
    return { value: policy?.autoConsentToDataProcessing ? 'true' : 'false', factIds: [], confidence: 100 };
  }

  if (policy?.sourceAttributionAnswer && SOURCE_ATTRIBUTION_TEST.test(haystack)) {
    // For a select/checkbox-group/radio-group, the policy string ("Career
    // Website") must resolve to one of the form's ACTUAL options, not be
    // injected as free text into a dropdown — fuzzy-matched the same way
    // apply-adapters/shared.js's fillSelect matches a drafted value against
    // real <option> text (exact match first, then substring). If nothing
    // matches, fall through to the LLM path rather than shipping a value
    // that can't resolve to a real option at fill time.
    const isGroupOrSelect = field.fieldType === 'checkbox-group' || field.fieldType === 'radio-group' || field.fieldType === 'select';
    if (!isGroupOrSelect) {
      return { value: policy.sourceAttributionAnswer, factIds: [], confidence: 100 };
    }
    const optionTexts = (field.options || []).map(o => o.optionText).filter(Boolean);
    const target = policy.sourceAttributionAnswer.toLowerCase().trim();
    const match = optionTexts.find(o => o.toLowerCase().trim() === target)
      || optionTexts.find(o => o.toLowerCase().includes(target) || target.includes(o.toLowerCase()));
    if (match) return { value: match, factIds: [], confidence: 100 };
  }
  // Includes facts derived from profile.fullName/phone/links.* so these
  // never need to be duplicated by hand into facts[] — see sanitize.js's
  // deriveIdentityFacts for why.
  const factsById = new Map(factsWithDerivedIdentity(profile).map(f => [f.id, f]));

  if (PREFERRED_NAME_TEST.test(haystack)) {
    const preferredFact = factsById.get('identity.preferredName');
    if (preferredFact?.approved !== false && preferredFact?.value) {
      return { value: preferredFact.value, factIds: ['identity.preferredName'], confidence: 100 };
    }
  }

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
module.exports = async function answerAgent(_job, profile, formFields, policy) {
  const answers = [];

  for (const field of formFields) {
    // Deterministic fast-path first — name/email/phone/links are exact-match
    // lookups, not something an LLM call adds value to. Also means these
    // never go unanswered just because unrelated LLM usage (e.g. bulk
    // fit-scoring) used up the day's self-imposed quota.
    const deterministic = tryDeterministicAnswer(field, profile, policy);
    if (deterministic) {
      answers.push({
        fieldKey: field.key,
        fieldLabel: field.label,
        value: deterministic.value,
        factIds: deterministic.factIds,
        confidence: deterministic.confidence,
        // Consent-checkbox answers are a policy decision, not a fact lookup
        // — tagged 'manual' so verifier.js doesn't flag their empty
        // factIds as 'unsupported' (see its equivalent comment).
        source: deterministic.factIds.length ? 'truth_store' : 'manual',
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

    // checkbox-group/radio-group fields (see form-inspector/extractFields.js's
    // groupCheckboxes) carry a fixed option list — the LLM must pick from
    // those exact option texts (enforced in the prompt), never invent one,
    // since the value has to resolve back to real option keys at fill time
    // (see apply-adapters/shared.js's fillCheckboxGroup).
    const isGroupField = field.fieldType === 'checkbox-group' || field.fieldType === 'radio-group';
    const optionTexts = isGroupField ? (field.options || []).map(o => o.optionText).filter(Boolean) : undefined;

    try {
      const llmResult = await callStructured({
        stage: 'answerGeneration',
        system: answerAgentPrompt.system,
        prompt: answerAgentPrompt.buildUserPrompt({
          fieldLabel: field.label,
          fieldType: field.fieldType || field.type,
          relevantFacts,
          options: optionTexts,
        }),
        schema: answerAgentPrompt.schema,
        model: resolveModel('answerGeneration'),
      });

      // For a group field, value is one or more of the ORIGINAL optionTexts
      // joined by "|" — validate it actually matches before trusting it,
      // since an LLM that ignores the "must be one of these exact strings"
      // instruction would otherwise resolve to nothing at fill time anyway;
      // catching it here (confidence 0) is more honest than shipping a
      // value that silently fails to check any box.
      if (isGroupField && llmResult.value) {
        const chosen = llmResult.value.split('|').map(v => v.trim());
        const allValid = chosen.every(v => optionTexts.includes(v));
        if (!allValid) {
          answers.push({ fieldKey: field.key, fieldLabel: field.label, value: null, factIds: [], confidence: 0, source: 'truth_store' });
          continue;
        }
      }

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
