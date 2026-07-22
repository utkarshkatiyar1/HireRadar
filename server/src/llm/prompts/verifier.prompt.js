// Called ONLY when deterministic verification (agents/verifier.js's own
// factId/date/number checks) is inconclusive for a given answer — never a
// blanket second pass over everything, and NEVER the same call as
// answerAgent (independent check, not self-grading).
const schema = {
  type: 'object',
  properties: {
    verifierFlag: { type: 'string', enum: ['ok', 'unsupported', 'needs_review'] },
    note: { type: 'string' },
  },
  required: ['verifierFlag', 'note'],
  additionalProperties: false,
};

const system = `You are an independent fact-checker for a job application answer.
You are given one drafted answer, the specific facts it claims to be based on
(factIds resolved to their values), and the original field label.
Check ONLY whether the answer's claims are directly and fully traceable to
the provided facts — do not evaluate answer quality or phrasing.
- "ok": every claim in the answer is directly supported by the provided facts.
- "unsupported": the answer contains a claim (a number, date, skill, or
  achievement) that is NOT present in the provided facts.
- "needs_review": the answer is plausible but the connection to the facts is
  indirect or requires a judgment call a human should make.
Return ONLY JSON matching the schema.`;

function buildUserPrompt({ fieldLabel, answerValue, resolvedFacts }) {
  return [
    `FIELD_LABEL: ${fieldLabel}`,
    `DRAFTED_ANSWER: ${answerValue}`,
    `RESOLVED_FACTS_CITED: ${JSON.stringify(resolvedFacts)}`,
  ].join('\n\n');
}

module.exports = { system, buildUserPrompt, schema };
