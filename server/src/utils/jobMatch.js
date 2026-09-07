const { scoreJob, DEFAULTS } = require('./filter');
const { sanitizeJobDescription } = require('../llm/sanitize');
const { embedText, cosineSimilarity, EMBEDDING_MODEL } = require('../llm/embeddings');
const { LlmError, LlmQuotaError } = require('../llm/errors');

// Shared between agents/fitScoring.js (post-apply Application scoring) and
// the /jobs recommendation pass (utils/jobMatchBatch.js) — both want the
// same keyword+embedding blend, just against different documents (Job vs.
// the job snapshot stored on an Application).

// Per-candidate embedding cache — a profile's skills/projects text is the
// same across every job it's scored against in one pass, so we embed it
// once instead of once per job. Keyed by profile._id; unbounded but tiny
// (one vector per candidate) and process-lifetime only.
const candidateEmbeddingCache = new Map();

// Flattens the profile fields that describe what the candidate can actually
// do — skills, project tech stacks/descriptions — into embeddable text.
function candidateEmbeddingText(profile) {
  const skills = (profile?.skills || []).map(s => s.name).join(', ');
  const projects = (profile?.projects || [])
    .map(p => `${p.title}: ${p.description || ''} (${(p.techStack || []).join(', ')})`)
    .join('\n');
  return [skills, projects].filter(Boolean).join('\n');
}

async function getCandidateEmbedding(profile) {
  const key = profile?._id ? String(profile._id) : null;
  if (key && candidateEmbeddingCache.has(key)) return candidateEmbeddingCache.get(key);

  const text = candidateEmbeddingText(profile);
  if (!text) return null;

  const vector = await embedText(text);
  if (key) candidateEmbeddingCache.set(key, vector);
  return vector;
}

// Semantic similarity (0-100 or null) between candidate skills/projects and
// a job description, via embeddings. Returns null (not 0) on empty JD input
// so callers can fall back to keyword-only scoring.
async function semanticSkillMatch(job, profile) {
  const jd = sanitizeJobDescription(job.description || `${job.title} — ${job.department || ''}`);
  if (!jd) return null;

  const [candidateVector, jobVector] = await Promise.all([
    getCandidateEmbedding(profile),
    embedText(jd),
  ]);
  if (!candidateVector) return null;

  const similarity = cosineSimilarity(candidateVector, jobVector); // -1..1, realistically 0..1 for this content
  return Math.max(0, Math.min(100, similarity * 100));
}

// Keyword-only skill match (0-100 scale) from filter.js's additive score.
function keywordSkillMatch(job) {
  const raw = scoreJob(job, DEFAULTS); // roughly -9..+9 in practice
  return Math.max(0, Math.min(100, 50 + raw * 6));
}

// A "hard exclusion" keyword floor — jobs that keyword matching flags as
// clearly wrong (heavy negative-signal hits) aren't worth an embedding call
// even under the semantic-dominant weighting below, since no amount of
// semantic similarity should resurrect a job keyword matching is confident
// is a bad fit. Deliberately low: this is a "don't bother" veto, not a
// plausibility floor — the keyword list is known-incomplete (it doesn't
// enumerate every off-track title, only some), so a *neutral* keyword score
// (no signal either way) must still get an embedding call to find out what
// the keywords couldn't. Only a strongly *negative* keyword score skips it.
const EMBEDDING_FLOOR = -25; // scoreJob's raw scale is roughly -9..+9 mapped onto 50±6*raw — this is unreachable by keyword scoring alone, so in practice the embedding call always runs; kept as a named escape hatch rather than removing the gate entirely.

// Computes a blended 0-100 match score for (job, profile). Keyword score is
// always computed (cheap, sync) as a hard-exclusion pre-filter and a
// tiebreak/fallback — it is NOT trusted as the primary "is this a match"
// signal, because filter.js's keyword lists are known-incomplete (e.g. they
// catch "recruiter" but miss "people solutions", "incident response",
// "conversational designer" — see the /jobs mismatch this was written to
// fix). When available, semantic similarity is weighted as the dominant
// signal (80/20) since it reflects the actual candidate-profile-to-JD
// relationship rather than surface word overlap. Falls back to keyword-only
// on any embedding/quota error — that fallback is intentionally NOT treated
// as equally trustworthy by callers (see routes/jobs.js's sort, which ranks
// semantically-scored jobs above keyword-only-fallback ones).
async function computeJobMatchScore(job, profile) {
  const keywordScore = keywordSkillMatch(job);

  let semanticScore = null;
  if (keywordScore >= EMBEDDING_FLOOR) {
    try {
      semanticScore = await semanticSkillMatch(job, profile);
    } catch (err) {
      if (!(err instanceof LlmQuotaError || err instanceof LlmError)) throw err;
      // Quota/provider outage — fall back to keyword-only. Callers should
      // treat this case as lower-confidence than a real semantic score.
    }
  }

  const total = semanticScore == null
    ? keywordScore
    : Math.round(keywordScore * 0.2 + semanticScore * 0.8);

  return { total, keywordScore, semanticScore };
}

module.exports = {
  keywordSkillMatch,
  semanticSkillMatch,
  computeJobMatchScore,
  candidateEmbeddingText, // exported for tests
  EMBEDDING_FLOOR,
  EMBEDDING_MODEL, // re-exported for scripts/diagnostics to log which model is actually in use
};
