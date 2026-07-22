// Verifies the explicit-prepare gate at the state-machine level: an
// Application landing on READY_FOR_PREPARATION must NOT be transitionable
// directly into PREPARING/answer-generation states — INSPECTING_FORM is the
// only next hop, and it is only ever entered via runPrepare (triggered by
// POST /applications/:id/prepare), never automatically by runEvaluation.
// Run with: node src/agents/__tests__/stateGating.test.js
const assert = require('assert');
const { canTransition, ALLOWED_TRANSITIONS } = require('../../utils/applicationState');

function testReadyForPreparationCannotJumpToPreparing() {
  assert.strictEqual(
    canTransition('READY_FOR_PREPARATION', 'PREPARING'),
    false,
    'READY_FOR_PREPARATION must not be able to skip straight to PREPARING — INSPECTING_FORM is required first'
  );
  console.log('PASS: READY_FOR_PREPARATION cannot transition directly to PREPARING');
}

function testReadyForPreparationOnlyAllowsInspectionSkipOrCancel() {
  const allowed = ALLOWED_TRANSITIONS.READY_FOR_PREPARATION;
  assert.deepStrictEqual(new Set(allowed), new Set(['INSPECTING_FORM', 'SKIPPED', 'CANCELLED']));
  console.log('PASS: READY_FOR_PREPARATION only allows INSPECTING_FORM, SKIPPED, or CANCELLED');
}

function testEvaluatingCannotJumpPastRecommendation() {
  const allowed = ALLOWED_TRANSITIONS.EVALUATING;
  assert.ok(!allowed.includes('PREPARING'), 'EVALUATING must not be able to reach PREPARING directly');
  assert.ok(!allowed.includes('READY_FOR_APPROVAL'), 'EVALUATING must not be able to reach READY_FOR_APPROVAL directly');
  console.log('PASS: EVALUATING cannot bypass the READY_FOR_PREPARATION recommendation stop');
}

function testRunEvaluationSourceStopsAtReadyForPreparation() {
  // Static check: agents/pipeline.js's runEvaluation function body must not
  // reference INSPECTING_FORM or the inspection queue — that hand-off lives
  // exclusively in runPrepare, which is only invoked by the explicit route.
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(path.join(__dirname, '../pipeline.js'), 'utf8');
  const start = source.indexOf('async function runEvaluation');
  // Stop at runEvaluation's own closing brace (the line "}\n\n// Stage 2a"
  // marks the end of the function, before the next function's doc-comment).
  const end = source.indexOf('\n}\n', start) + 2;
  const runEvaluationBody = source.slice(start, end);
  assert.ok(!runEvaluationBody.includes('INSPECTING_FORM'), 'runEvaluation must not transition to INSPECTING_FORM itself');
  assert.ok(!runEvaluationBody.includes('getInspectionQueue'), 'runEvaluation must not enqueue inspection itself');
  console.log('PASS: runEvaluation source contains no path to INSPECTING_FORM — only runPrepare does');
}

(async () => {
  testReadyForPreparationCannotJumpToPreparing();
  testReadyForPreparationOnlyAllowsInspectionSkipOrCancel();
  testEvaluatingCannotJumpPastRecommendation();
  testRunEvaluationSourceStopsAtReadyForPreparation();
  console.log('\nAll state-gating tests passed.');
})();
