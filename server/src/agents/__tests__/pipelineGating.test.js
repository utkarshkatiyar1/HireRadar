// Verifies the cost-control invariants the user specified, using mocked
// deterministic inputs (no network/DB required for the parts that don't
// touch Mongo). Run with: node src/agents/__tests__/pipelineGating.test.js
const assert = require('assert');
const Module = require('module');

// Mocks callStructured so we can assert it is/isn't called, without any
// network or API key.
function withMockedLlm(callCounterRef, testFn) {
  const callStructuredPath = require.resolve('../../llm/callStructured');
  delete require.cache[callStructuredPath];

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === '../llm/callStructured' || request.endsWith('/llm/callStructured')) {
      return {
        callStructured: async (opts) => {
          callCounterRef.count++;
          callCounterRef.stages.push(opts.stage);
          throw new Error('LLM should not have been called in this test');
        },
      };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    return testFn();
  } finally {
    Module._load = originalLoad;
  }
}

async function testEligibilityDoesNotCallLlmWhenDeterministicRejects() {
  const counter = { count: 0, stages: [] };
  await withMockedLlm(counter, async () => {
    delete require.cache[require.resolve('../eligibility')];
    const eligibility = require('../eligibility');

    // Location deterministically fails — should never reach the LLM branch.
    const job = { title: 'Software Engineer', location: 'Antarctica', exp: '2 years' };
    const result = await eligibility({}, job, { totalExpYears: 2 }, {});
    assert.strictEqual(result.passed, false);
    assert.strictEqual(counter.count, 0, 'LLM must not be called when a deterministic rule already rejects');
  });
  console.log('PASS: eligibility skips LLM entirely when deterministic rules already decide');
}

async function testFitScoringSkipsLlmBelowPlausibilityThreshold() {
  const counter = { count: 0, stages: [] };
  await withMockedLlm(counter, async () => {
    delete require.cache[require.resolve('../fitScoring')];
    const fitScoring = require('../fitScoring');

    // A job with zero matching signals and heavy negative-signal keywords
    // should score well below the plausibility threshold deterministically.
    const job = { title: 'Senior Java Backend Engineer', department: 'Backend', exp: '10 years' };
    const result = await fitScoring({}, job, { totalExpYears: 2, skills: [] });
    assert.strictEqual(counter.count, 0, 'LLM must not be called for an implausible deterministic score');
    assert.ok(result.total < 40, `expected a low deterministic score, got ${result.total}`);
  });
  console.log('PASS: fitScoring skips LLM refinement for implausible deterministic scores');
}

async function testAnswerAgentSkipsLlmWhenNoRelevantFacts() {
  const counter = { count: 0, stages: [] };
  await withMockedLlm(counter, async () => {
    delete require.cache[require.resolve('../answerAgent')];
    const answerAgent = require('../answerAgent');

    const profile = { facts: [{ id: 'x.y', label: 'Unrelated fact', value: 'abc', approved: true }] };
    const fields = [{ key: 'zzz', label: 'Completely Unmatched Field Label Xyzzy', fieldType: 'text' }];
    const answers = await answerAgent(null, profile, fields);
    assert.strictEqual(counter.count, 0, 'LLM must not be called when no fact matches the field at all');
    assert.strictEqual(answers[0].value, null);
    assert.strictEqual(answers[0].confidence, 0);
  });
  console.log('PASS: answerAgent skips LLM and abstains when no relevant fact exists');
}

async function testVerifierRunsDeterministicFirstAndSkipsLlmWhenConclusive() {
  const counter = { count: 0, stages: [] };
  await withMockedLlm(counter, async () => {
    delete require.cache[require.resolve('../verifier')];
    const verifier = require('../verifier');

    const profile = { facts: [{ id: 'a.b', label: 'Years at X', value: '2 years', approved: true }] };
    const answers = [{ fieldKey: 'f1', fieldLabel: 'Years', value: '2 years', factIds: ['a.b'], confidence: 90 }];
    const results = await verifier(answers, profile);
    assert.strictEqual(counter.count, 0, 'LLM verifier must not be called when deterministic verification is conclusive');
    assert.strictEqual(results[0].verifierFlag, 'ok');
  });
  console.log('PASS: verifier resolves deterministically and never calls the LLM when conclusive');
}

async function testVerifierFlagsUnsupportedFactIdWithoutLlm() {
  const counter = { count: 0, stages: [] };
  await withMockedLlm(counter, async () => {
    delete require.cache[require.resolve('../verifier')];
    const verifier = require('../verifier');

    const profile = { facts: [] }; // no facts at all
    const answers = [{ fieldKey: 'f1', fieldLabel: 'X', value: 'some claim', factIds: ['nonexistent.fact'], confidence: 90 }];
    const results = await verifier(answers, profile);
    assert.strictEqual(counter.count, 0);
    assert.strictEqual(results[0].verifierFlag, 'unsupported');
  });
  console.log('PASS: verifier deterministically flags an unresolvable factId as unsupported, no LLM needed');
}

(async () => {
  await testEligibilityDoesNotCallLlmWhenDeterministicRejects();
  await testFitScoringSkipsLlmBelowPlausibilityThreshold();
  await testAnswerAgentSkipsLlmWhenNoRelevantFacts();
  await testVerifierRunsDeterministicFirstAndSkipsLlmWhenConclusive();
  await testVerifierFlagsUnsupportedFactIdWithoutLlm();
  console.log('\nAll pipeline-gating tests passed.');
})().catch(e => { console.error('TEST FAILED:', e); process.exit(1); });
