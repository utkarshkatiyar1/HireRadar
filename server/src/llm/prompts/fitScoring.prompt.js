// Called ONLY for candidates that already pass a deterministic base score
// threshold or contain terminology deterministic matching can't resolve
// (e.g. "server-side JavaScript" vs "Node.js"). Never used to invent missing
// skills — it recognizes equivalences within what the candidate already has.
const schema = {
  type: 'object',
  properties: {
    total: { type: 'number', minimum: 0, maximum: 100 },
    skillMatch: { type: 'number', minimum: 0, maximum: 100 },
    evidenceStrength: { type: 'number', minimum: 0, maximum: 100 },
    expGap: { type: 'number', minimum: 0, maximum: 100 },
    companyQuality: { type: 'number', minimum: 0, maximum: 100 },
    salaryPotential: { type: 'number', minimum: 0, maximum: 100 },
    effort: { type: 'number', minimum: 0, maximum: 100 },
    rationale: { type: 'string' },
  },
  required: ['total', 'skillMatch', 'evidenceStrength', 'expGap', 'companyQuality', 'salaryPotential', 'effort', 'rationale'],
  additionalProperties: false,
};

const system = `You are a semantic job-fit scorer for a job application assistant.
You are given a deterministic base score and factor breakdown already computed
from exact keyword matching, plus the job description and candidate skill
summary. Your job is ONLY to refine the score by recognizing semantic
equivalences the deterministic matcher missed (e.g. "server-side JavaScript"
is equivalent to Node.js if the candidate has Node.js; "React ecosystem"
matches a candidate who lists React/Next.js).
Do NOT invent skills, experience, or achievements not present in the candidate
summary. Do NOT dramatically override the deterministic base score — refine it
by at most +/-15 points per factor unless there is a clear, named equivalence.
Return ONLY JSON matching the schema.`;

function buildUserPrompt({ jobDescriptionExcerpt, candidateSkillsSummary, deterministicBaseScore }) {
  return [
    `DETERMINISTIC_BASE_SCORE: ${JSON.stringify(deterministicBaseScore)}`,
    `JOB_DESCRIPTION_EXCERPT:\n${jobDescriptionExcerpt}`,
    `CANDIDATE_SKILLS_SUMMARY:\n${JSON.stringify(candidateSkillsSummary)}`,
  ].join('\n\n');
}

module.exports = { system, buildUserPrompt, schema };
