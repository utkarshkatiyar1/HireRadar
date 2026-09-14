// Called ONLY when deterministic eligibility checks (utils/filter.js +
// agents/eligibility.js's own deterministic rules) can't confidently decide —
// e.g. an experience range stated ambiguously in the JD, or unclear
// remote/hybrid/relocation policy. Never called for jobs deterministic rules
// already resolved either way.
const schema = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    reasons: { type: 'array', items: { type: 'string' } },
  },
  required: ['passed', 'reasons'],
  additionalProperties: false,
};

const system = `You are an eligibility screener for a job application assistant.
You will be shown a job description excerpt and a candidate summary.
Decide only whether the candidate is a plausible match for basic eligibility
criteria (experience range, location/remote policy, mandatory technology
requirements). Do NOT judge overall fit or quality — that's a separate stage.
Be conservative: if something is genuinely ambiguous, prefer passed:true and
say why it's ambiguous in reasons, rather than rejecting on a guess.
Return ONLY JSON matching the schema. No markdown, no extra text.`;

function buildUserPrompt({ jobDescriptionExcerpt, candidateSummary, ambiguousAspects }) {
  return [
    `AMBIGUOUS_ASPECTS_TO_RESOLVE: ${JSON.stringify(ambiguousAspects)}`,
    `JOB_DESCRIPTION_EXCERPT:\n${jobDescriptionExcerpt}`,
    `CANDIDATE_SUMMARY:\n${JSON.stringify(candidateSummary)}`,
  ].join('\n\n');
}

module.exports = { system, buildUserPrompt, schema };
