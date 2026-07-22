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

Return ONLY JSON matching the schema.`;

function buildUserPrompt({ fieldLabel, fieldType, relevantFacts }) {
  return [
    `FORM_FIELD: label="${fieldLabel}" type="${fieldType}"`,
    `CANDIDATE_TRUTH_STORE (only these facts may be used):\n${JSON.stringify(relevantFacts, null, 2)}`,
  ].join('\n\n');
}

module.exports = { system, buildUserPrompt, schema };
