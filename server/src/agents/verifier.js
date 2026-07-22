const { callStructured } = require('../llm/callStructured');
const { resolveModel } = require('../llm/modelRouter');
const verifierPrompt = require('../llm/prompts/verifier.prompt');
const { LlmError, LlmQuotaError } = require('../llm/errors');

const PROHIBITED_TERMS = ['expert', 'extensive experience', 'world-class', 'guru', 'ninja ' /* trailing space avoids "engineering" false-positive */];

// Deterministic checks — runs on every answer before any LLM verifier call.
// Returns { decided, flag, note } — decided:false means the LLM fallback is
// needed because the deterministic pass genuinely can't tell.
function runDeterministicVerification(answer, profile) {
  if (!answer.value) {
    return { decided: true, flag: 'ok', note: 'no value drafted — nothing to verify' };
  }

  if (!answer.factIds || answer.factIds.length === 0) {
    return { decided: true, flag: 'unsupported', note: 'answer has a value but no factIds — cannot ground it' };
  }

  const factsById = new Map((profile?.facts || []).map(f => [f.id, f]));
  const unresolvedIds = answer.factIds.filter(id => !factsById.has(id));
  if (unresolvedIds.length) {
    return { decided: true, flag: 'unsupported', note: `references unknown fact id(s): ${unresolvedIds.join(', ')}` };
  }

  const unapproved = answer.factIds.filter(id => factsById.get(id).approved === false);
  if (unapproved.length) {
    return { decided: true, flag: 'unsupported', note: `references unapproved fact id(s): ${unapproved.join(', ')}` };
  }

  const lowerValue = answer.value.toLowerCase();
  const prohibited = PROHIBITED_TERMS.find(term => lowerValue.includes(term));
  if (prohibited) {
    const anyFactSaysIt = answer.factIds.some(id => (factsById.get(id).value || '').toLowerCase().includes(prohibited));
    if (!anyFactSaysIt) {
      return { decided: true, flag: 'unsupported', note: `uses unsupported strength language ("${prohibited.trim()}") not present in cited facts` };
    }
  }

  // Numeric claim check: any number in the answer should be traceable to a
  // number in one of the cited facts (loose check — exact string containment
  // of the digit sequence is enough to catch fabricated/inflated numbers
  // without over-engineering full NLP number extraction).
  const answerNumbers = answer.value.match(/\d+(\.\d+)?/g) || [];
  const factNumbers = new Set(
    answer.factIds.flatMap(id => (factsById.get(id).value.match(/\d+(\.\d+)?/g) || []))
  );
  const unsupportedNumbers = answerNumbers.filter(n => !factNumbers.has(n));
  if (unsupportedNumbers.length) {
    return { decided: false, flag: null, note: `contains number(s) ${unsupportedNumbers.join(', ')} not found verbatim in cited facts — needs closer review` };
  }

  return { decided: true, flag: 'ok', note: 'all claims trace to cited, approved facts' };
}

// Real verifier agent. Runs deterministic checks on every answer first —
// this is the primary path and keeps the LLM verifier as an EXCEPTION, not a
// tax on every field. The LLM call is a separate prompt/call from
// answerAgent.js (independent check, never self-grading).
module.exports = async function verifier(answers, profile) {
  const results = [];

  for (const answer of answers) {
    const det = runDeterministicVerification(answer, profile);

    if (det.decided) {
      results.push({ ...answer, verifierFlag: det.flag });
      continue;
    }

    try {
      const factsById = new Map((profile?.facts || []).map(f => [f.id, f]));
      const resolvedFacts = answer.factIds.map(id => ({ id, value: factsById.get(id)?.value }));
      const llmResult = await callStructured({
        stage: 'verifier',
        system: verifierPrompt.system,
        prompt: verifierPrompt.buildUserPrompt({
          fieldLabel: answer.fieldLabel,
          answerValue: answer.value,
          resolvedFacts,
        }),
        schema: verifierPrompt.schema,
        model: resolveModel('verifier'),
      });
      results.push({ ...answer, verifierFlag: llmResult.verifierFlag });
    } catch (err) {
      if (err instanceof LlmQuotaError || err instanceof LlmError) {
        // Deterministic pass was inconclusive AND the LLM fallback is
        // unavailable — require manual review rather than auto-approving or
        // failing the whole application.
        results.push({ ...answer, verifierFlag: 'needs_review' });
      } else {
        throw err;
      }
    }
  }

  return results;
};
