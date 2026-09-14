// Called ONLY when deterministic tag-overlap scoring produces a tie between
// two or more resume variants — never for a clear deterministic winner.
const schema = {
  type: 'object',
  properties: {
    chosenLabel: { type: 'string' },
    rationale: { type: 'string' },
  },
  required: ['chosenLabel', 'rationale'],
  additionalProperties: false,
};

const system = `You are breaking a tie between resume variants for a job application.
You are given the job description and a short list of tied resume variants
(label + tags only). Pick the single best label from the list — do not invent
a new label. Base the decision only on which variant's tags best match the
role described.
Return ONLY JSON matching the schema.`;

function buildUserPrompt({ jobDescriptionExcerpt, tiedVariants }) {
  return [
    `TIED_RESUME_VARIANTS: ${JSON.stringify(tiedVariants.map(v => ({ label: v.label, tags: v.tags })))}`,
    `JOB_DESCRIPTION_EXCERPT:\n${jobDescriptionExcerpt}`,
  ].join('\n\n');
}

module.exports = { system, buildUserPrompt, schema };
