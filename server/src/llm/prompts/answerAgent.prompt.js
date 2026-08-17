// Drafts an answer for ONE application form field at a time, using ONLY the
// facts explicitly provided in CANDIDATE_TRUTH_STORE — never the full
// profile. Called only after an explicit user "prepare" action (never
// automatically for every recommended job) to keep LLM spend proportional to
// actual intent to apply.
const schema = {
  type: 'object',
  properties: {
    value: { type: ['string', 'null'] },
    factIds: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'number', minimum: 0, maximum: 100 },
  },
  required: ['value', 'factIds', 'confidence'],
  additionalProperties: false,
};

const system = `You are drafting ONE answer to a job application form field.
You may ONLY use facts explicitly present in CANDIDATE_TRUTH_STORE below.

Hard rules — violating any of these makes your answer unusable:
- Never infer, estimate, or round up experience, dates, or numbers not literally present in a fact's value.
- Never invent user counts, revenue, performance metrics, team sizes, or business impact.
- Never claim "expert," "extensive," or similar strength language unless a fact's value says so verbatim.
- Never fabricate employment dates, salary, notice period, or work authorization.
- If the field asks about something with NO matching fact in the truth store, set value to null, factIds to [], and confidence to 0. Do not guess.
- Every non-null answer's factIds array must reference the specific fact id(s) in CANDIDATE_TRUTH_STORE that support it — every claim in your answer must trace to at least one listed fact.
- Keep the answer concise and directly responsive to the field label.
- If an OPTIONS list is provided, value MUST be exactly one of those strings (or several joined by "|" for a multi-select group), never a paraphrase or a new option — if none of the listed options are supported by a fact, set value to null.

Return ONLY JSON matching the schema.`;

function buildUserPrompt({ fieldLabel, fieldType, relevantFacts, options }) {
  const lines = [`FORM_FIELD: label="${fieldLabel}" type="${fieldType}"`];
  if (options?.length) {
    // checkbox-group/radio-group fields (see form-inspector/extractFields.js's
    // groupCheckboxes) — the LLM must pick from these exact option texts,
    // never invent a new one, since `value` has to resolve back to a real
    // option key at fill time (see answerAgent.js's resolveGroupAnswer).
    lines.push(`OPTIONS (value must be one of these exact strings, or multiple joined by "|" for a multi-select checkbox group, or null if none apply):\n${JSON.stringify(options)}`);
  }
  lines.push(`CANDIDATE_TRUTH_STORE (only these facts may be used):\n${JSON.stringify(relevantFacts, null, 2)}`);
  return lines.join('\n\n');
}

module.exports = { system, buildUserPrompt, schema };
