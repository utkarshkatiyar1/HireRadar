// Golden-set evaluation for the eligibility/fitScoring agents against a
// fixture of real scraped-job shapes with hand-labeled expected outcomes.
// Run after ANY prompt change, before touching real production data:
//   node scripts/eval-agents.js
//
// Requires GEMINI_API_KEY and MONGO_URI to be set (eligibility/fitScoring's
// LLM fallback paths and the usage-limiter both need a real DB connection).
require('dotenv').config();
const path = require('path');
const fixtures = require('../src/agents/__fixtures__/sample-jobs.json');
const { connect } = require('../src/utils/db');
const eligibility = require('../src/agents/eligibility');
const fitScoring = require('../src/agents/fitScoring');

const TEST_PROFILE = { totalExpYears: 2, skills: [{ name: 'React', yearsExp: 2 }, { name: 'Node.js', yearsExp: 2 }] };
const TEST_POLICY = { minimumScore: 0, maximumExperienceGapYears: 1 };

async function run() {
  await connect();

  let pass = 0, fail = 0;
  const failures = [];

  for (const fixture of fixtures) {
    const job = { title: fixture.title, company: fixture.company, location: fixture.location, exp: fixture.exp, department: fixture.department };

    const eligResult = await eligibility({}, job, TEST_PROFILE, TEST_POLICY);
    const eligOk = eligResult.passed === fixture.expected.eligibilityPassed;
    const reasonOk = !fixture.expected.reasonContains
      || eligResult.reasons.some(r => r.toLowerCase().includes(fixture.expected.reasonContains.toLowerCase()));

    let fitOk = true;
    let fitTotal = null;
    if (eligResult.passed && fixture.expected.fitScoreAtLeast != null) {
      const fit = await fitScoring({}, job, TEST_PROFILE);
      fitTotal = fit.total;
      fitOk = fit.total >= fixture.expected.fitScoreAtLeast;
    }

    const ok = eligOk && reasonOk && fitOk;
    if (ok) {
      pass++;
    } else {
      fail++;
      failures.push({
        title: fixture.title, company: fixture.company,
        expected: fixture.expected,
        actual: { eligibilityPassed: eligResult.passed, reasons: eligResult.reasons, fitTotal },
      });
    }
  }

  console.log(`\nGolden-set eval: ${pass}/${fixtures.length} passed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(`  - ${f.title} @ ${f.company}`);
      console.log(`      expected: ${JSON.stringify(f.expected)}`);
      console.log(`      actual:   ${JSON.stringify(f.actual)}`);
    }
  }

  process.exit(fail > 0 ? 1 : 0);
}

if (require.main === module) {
  run().catch(e => { console.error('eval-agents fatal error', e); process.exit(1); });
}

module.exports = run;
