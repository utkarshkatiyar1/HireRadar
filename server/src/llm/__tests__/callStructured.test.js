// Lightweight assertion-based tests (no test runner dependency) — run with
// `node src/llm/__tests__/callStructured.test.js`. Mocks the Gemini provider
// so these run offline, with no network/API key required.
const assert = require('assert');
const Module = require('module');

const SCHEMA = {
  type: 'object',
  properties: { status: { type: 'string', enum: ['ok', 'error'] } },
  required: ['status'],
  additionalProperties: false,
};

// Intercepts require('./client') calls made by callStructured.js so we can
// swap in a fake provider per test without touching real network/env state.
function withMockedProvider(generateStructuredImpl, testFn) {
  const clientPath = require.resolve('../client');
  delete require.cache[clientPath];
  delete require.cache[require.resolve('../callStructured')];

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === './client' || request.endsWith('/llm/client')) {
      return { getProvider: () => ({ name: 'mock', generateStructured: generateStructuredImpl }) };
    }
    if (request === './usageLimiter' || request.endsWith('/llm/usageLimiter')) {
      return { assertWithinDailyLimit: async () => {}, recordUsage: async () => {} };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    const { callStructured } = require('../callStructured');
    return testFn(callStructured);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve('../callStructured')];
  }
}

async function testSchemaValidationRetrySucceedsOnSecondAttempt() {
  let callCount = 0;
  const fakeProvider = async () => {
    callCount++;
    return callCount === 1 ? { status: 'INVALID_VALUE' } : { status: 'ok' };
  };

  await withMockedProvider(fakeProvider, async (callStructured) => {
    const result = await callStructured({ stage: 'test', system: 's', prompt: 'p', schema: SCHEMA, model: 'fake', maxRetries: 1 });
    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(callCount, 2, 'expected exactly one retry (2 total calls)');
  });
  console.log('PASS: schema validation retry succeeds on second attempt');
}

async function testSchemaValidationFailsAfterMaxRetries() {
  const fakeProvider = async () => ({ status: 'INVALID_VALUE' });

  await withMockedProvider(fakeProvider, async (callStructured) => {
    let threw = null;
    try {
      await callStructured({ stage: 'test', system: 's', prompt: 'p', schema: SCHEMA, model: 'fake', maxRetries: 1 });
    } catch (e) {
      threw = e;
    }
    assert.ok(threw, 'expected callStructured to throw after exhausting retries');
    assert.strictEqual(threw.name, 'LlmSchemaValidationError');
  });
  console.log('PASS: schema validation fails after max retries with typed error');
}

async function testMalformedOutputPropagates() {
  const { LlmMalformedOutputError } = require('../errors');
  const fakeProvider = async () => { throw new LlmMalformedOutputError('not json'); };

  await withMockedProvider(fakeProvider, async (callStructured) => {
    let threw = null;
    try {
      await callStructured({ stage: 'test', system: 's', prompt: 'p', schema: SCHEMA, model: 'fake', maxRetries: 0 });
    } catch (e) {
      threw = e;
    }
    assert.ok(threw instanceof LlmMalformedOutputError);
  });
  console.log('PASS: malformed output error propagates with correct type');
}

async function testQuotaErrorPropagatesWithoutRetryLoop() {
  const { LlmQuotaError } = require('../errors');
  let callCount = 0;
  const fakeProvider = async () => { callCount++; throw new LlmQuotaError('quota exceeded'); };

  await withMockedProvider(fakeProvider, async (callStructured) => {
    let threw = null;
    try {
      await callStructured({ stage: 'test', system: 's', prompt: 'p', schema: SCHEMA, model: 'fake', maxRetries: 2 });
    } catch (e) {
      threw = e;
    }
    assert.ok(threw instanceof LlmQuotaError);
    // callStructured's retry loop only re-prompts on schema/malformed-output
    // errors, never on provider/quota errors — must not tight-loop retry a quota error.
    assert.strictEqual(callCount, 1, 'quota errors must not be retried in a tight loop');
  });
  console.log('PASS: quota error propagates immediately without retry-looping');
}

(async () => {
  await testSchemaValidationRetrySucceedsOnSecondAttempt();
  await testSchemaValidationFailsAfterMaxRetries();
  await testMalformedOutputPropagates();
  await testQuotaErrorPropagatesWithoutRetryLoop();
  console.log('\nAll callStructured tests passed.');
})().catch(e => { console.error('TEST FAILED:', e); process.exit(1); });
