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

// Mocks embeddings.js so semantic blending can be asserted without network
// access — separate from withMockedLlm, which only mocks callStructured.
function withMockedEmbeddings(embedCallsRef, vectorsByText, testFn) {
  const embeddingsPath = require.resolve('../../llm/embeddings');
  delete require.cache[embeddingsPath];
  // jobMatch.js requires embeddings.js at module-load time and closes over
  // the (possibly already-cached, real) exports — must also be evicted so it
  // re-requires embeddings.js under this mock rather than reusing a stale
  // reference from an earlier test in this same process.
  const jobMatchPath = require.resolve('../../utils/jobMatch');
  delete require.cache[jobMatchPath];

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === '../llm/embeddings' || request.endsWith('/llm/embeddings')) {
      return {
        embedText: async (text) => {
          embedCallsRef.count++;
          const key = Object.keys(vectorsByText).find(k => text.includes(k));
          return vectorsByText[key] || [1, 0, 0];
        },
        cosineSimilarity: (a, b) => {
          let dot = 0, magA = 0, magB = 0;
          for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; magA += a[i] * a[i]; magB += b[i] * b[i]; }
          return magA === 0 || magB === 0 ? 0 : dot / (Math.sqrt(magA) * Math.sqrt(magB));
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

// Mocks callStructured to succeed (rather than throw) — used only by the
// embedding-blend test below, which needs the LLM refinement path to run so
// it can assert the blended deterministic score is what got passed in.
function withSucceedingMockedLlm(callArgsRef, testFn) {
  const callStructuredPath = require.resolve('../../llm/callStructured');
  delete require.cache[callStructuredPath];

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === '../llm/callStructured' || request.endsWith('/llm/callStructured')) {
      return {
        callStructured: async (opts) => {
          callArgsRef.push(opts);
          return { total: 50, skillMatch: 50, evidenceStrength: 50, expGap: 50, companyQuality: 50, salaryPotential: 50, effort: 50, rationale: 'mocked' };
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

async function testFitScoringBlendsEmbeddingSimilarityWhenKeywordScorePlausible() {
  const llmCalls = [];
  const embedCounter = { count: 0 };
  await withSucceedingMockedLlm(llmCalls, async () => {
    await withMockedEmbeddings(
      embedCounter,
      { React: [1, 0, 0], 'Frontend Engineer': [1, 0, 0] }, // identical vectors -> similarity 1.0 -> semanticScore 100
      async () => {
        delete require.cache[require.resolve('../fitScoring')];
        const fitScoring = require('../fitScoring');

        const job = { title: 'Frontend Engineer', department: 'Web', description: 'Frontend Engineer role' };
        const profile = { totalExpYears: 2, skills: [{ name: 'React' }] };
        await fitScoring({}, job, profile);

        assert.ok(embedCounter.count >= 2, `expected embedding calls for candidate + job text, got ${embedCounter.count}`);
        assert.strictEqual(llmCalls.length, 1, 'expected the LLM refinement call to run for this plausible score');
        const basePassedToLlm = llmCalls[0].prompt;
        assert.ok(basePassedToLlm.includes('semantic similarity'), 'expected the blended base score (with embedding rationale) to be passed into the LLM prompt');
      },
    );
  });
  console.log('PASS: fitScoring calls embeddings and blends semantic similarity when keyword score is plausible');
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
  await testFitScoringBlendsEmbeddingSimilarityWhenKeywordScorePlausible();
  await testAnswerAgentSkipsLlmWhenNoRelevantFacts();
  await testVerifierRunsDeterministicFirstAndSkipsLlmWhenConclusive();
  await testVerifierFlagsUnsupportedFactIdWithoutLlm();
  console.log('\nAll pipeline-gating tests passed.');
})().catch(e => { console.error('TEST FAILED:', e); process.exit(1); });
