// Enforces the Application status state machine so a bug elsewhere can't
// silently jump straight to SUBMITTED or bypass approval. Each key lists the
// states that key is allowed to transition INTO.
const ALLOWED_TRANSITIONS = {
  DISCOVERED:             ['EVALUATING', 'SKIPPED', 'CANCELLED'],
  // EVALUATING covers eligibility AND fit-scoring (both cheap/deterministic-
  // first) and lands on READY_FOR_PREPARATION as a RECOMMENDATION shown to
  // the user — form-inspection/answer-generation do NOT start automatically.
  // They begin only via the explicit POST /applications/:id/prepare action
  // (Milestone 4: keeps LLM + Playwright spend proportional to actual intent
  // to apply, not every job that merely passes eligibility).
  EVALUATING:             ['REJECTED', 'READY_FOR_PREPARATION', 'FAILED'],
  REJECTED:               ['EVALUATING'], // admin retry / re-evaluation only
  SKIPPED:                [], // terminal — user's own call, no automatic re-entry
  READY_FOR_PREPARATION:  ['INSPECTING_FORM', 'SKIPPED', 'CANCELLED'],
  INSPECTING_FORM:        ['PREPARING', 'READY_FOR_APPROVAL', 'EXPIRED', 'FAILED'],
  PREPARING:              ['READY_FOR_APPROVAL', 'FAILED'],
  READY_FOR_APPROVAL:     ['APPROVED', 'SKIPPED'],
  APPROVED:               ['APPLYING', 'CANCELLED'],
  APPLYING:               ['SUBMITTED', 'DRY_RUN_COMPLETED', 'SUBMISSION_UNCONFIRMED', 'ACTION_REQUIRED', 'SUBMISSION_BLOCKED', 'FAILED'],
  ACTION_REQUIRED:        ['APPLYING', 'SKIPPED', 'CANCELLED'], // resume re-enqueues back into APPLYING
  DRY_RUN_COMPLETED:      ['APPROVED'], // re-approve to actually submit once dry-run is validated
  SUBMITTED:              [], // terminal
  SUBMISSION_UNCONFIRMED: [], // terminal — never auto-retried, must be manually reconciled
  SUBMISSION_BLOCKED:     [], // terminal
  CANCELLED:              [], // terminal
  EXPIRED:                [], // terminal
  FAILED:                 ['EVALUATING', 'APPLYING'], // admin retry route re-enters here
};

class InvalidTransitionError extends Error {
  constructor(from, to) {
    super(`Invalid Application status transition: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
    this.from = from;
    this.to = to;
  }
}

const canTransition = (from, to) => (ALLOWED_TRANSITIONS[from] || []).includes(to);

// Mutates `application` in place (status + statusHistory) and returns it —
// caller is responsible for .save()'ing. Throws InvalidTransitionError rather
// than silently allowing an illegal jump.
const transition = (application, to, note) => {
  const from = application.status;
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
  application.status = to;
  application.statusHistory.push({ status: to, at: new Date(), note });
  return application;
};

module.exports = { ALLOWED_TRANSITIONS, canTransition, transition, InvalidTransitionError };
