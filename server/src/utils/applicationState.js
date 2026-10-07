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
  READY_FOR_PREPARATION:  ['INSPECTING_FORM', 'SKIPPED', 'CANCELLED', 'APPLIED_MANUALLY'],
  INSPECTING_FORM:        ['PREPARING', 'READY_FOR_APPROVAL', 'EXPIRED', 'FAILED'],
  PREPARING:              ['READY_FOR_APPROVAL', 'FAILED'],
  // PREPARING re-entry: lets a user re-run resume routing/answer drafting/
  // verification on an already-drafted application (e.g. after fixing gaps
  // in their Candidate Profile) without needing an admin retry — see
  // POST /applications/:id/reprepare.
  // INSPECTING_FORM re-entry: lets a user force a fresh form-inspection on
  // an already-drafted application — see POST /applications/:id/reinspect.
  // Distinct from the PREPARING re-entry (reprepare) above: reprepare
  // reuses the EXISTING formInspection.fields snapshot (fine when only the
  // candidate's profile/facts changed), which does nothing for a bad field
  // baked into that snapshot itself (e.g. a site-search widget or CAPTCHA
  // response field mis-extracted as a real question — see form-inspector/
  // extractFields.js's incident comments). Only re-inspection re-runs the
  // actual DOM extraction and can drop a field like that.
  READY_FOR_APPROVAL:     ['APPROVED', 'SKIPPED', 'PREPARING', 'INSPECTING_FORM', 'APPLIED_MANUALLY'],
  APPROVED:               ['APPLYING', 'CANCELLED'],
  APPLYING:               ['SUBMITTED', 'DRY_RUN_COMPLETED', 'SUBMISSION_UNCONFIRMED', 'ACTION_REQUIRED', 'SUBMISSION_BLOCKED', 'FAILED'],
  ACTION_REQUIRED:        ['APPLYING', 'SKIPPED', 'CANCELLED', 'APPLIED_MANUALLY'], // resume re-enqueues back into APPLYING
  DRY_RUN_COMPLETED:      ['APPROVED', 'INSPECTING_FORM', 'APPLIED_MANUALLY'], // re-approve to actually submit once dry-run is validated; INSPECTING_FORM — see reinspect above
  SUBMITTED:              [], // terminal
  APPLIED_MANUALLY:       [], // terminal — user applied outside the tool, same as SUBMITTED but never went through our apply pipeline
  // Admin-only re-entry (POST /admin/applications/:id/retry) — still never
  // auto-retried by the pipeline itself. Exists for the case where the
  // unconfirmed outcome is traceable to a real bug (e.g. the resume-attach
  // fix in apply-adapters/*.js) that's since been fixed, and a human has
  // manually confirmed the original attempt did NOT actually submit.
  SUBMISSION_UNCONFIRMED: ['APPLYING'],
  SUBMISSION_BLOCKED:     [], // terminal
  CANCELLED:              [], // terminal
  EXPIRED:                [], // terminal
  // admin retry route (POST /admin/applications/:id/retry) re-enters here —
  // which target depends on which stage failed: EVALUATING for an
  // eligibility/fit-scoring failure, READY_FOR_PREPARATION to restart the
  // whole prepare flow (inspection+drafting) from scratch for an
  // INSPECTING_FORM/PREPARING failure (safe — runPreparation never persists
  // partial progress, see agents/pipeline.js), APPLYING to re-enqueue submission.
  FAILED:                 ['EVALUATING', 'READY_FOR_PREPARATION', 'APPLYING'],
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
  const now = new Date();
  application.status = to;
  application.statusHistory.push({ status: to, at: now, note });
  // Denormalized + indexed (see models/application.js) so GET /applications
  // can sort/paginate "most recently changed" directly in MongoDB instead of
  // loading every matching document into Node to sort statusHistory there —
  // that in-memory approach was the actual cause of Issues/Done feeling slow
  // once REJECTED alone passed several thousand documents.
  application.lastStatusChangeAt = now;
  return application;
};

module.exports = { ALLOWED_TRANSITIONS, canTransition, transition, InvalidTransitionError };
