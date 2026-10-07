const mongoose = require('mongoose');

// Supersedes UserJobState with a richer state machine — see
// server/src/scripts/backfill-applications.js for the one-off migration and
// server/src/utils/applicationState.js for the transition helper.
const STATUSES = [
  'DISCOVERED', 'EVALUATING', 'REJECTED', 'SKIPPED',
  'READY_FOR_PREPARATION', 'INSPECTING_FORM', 'PREPARING', 'READY_FOR_APPROVAL',
  'APPROVED', 'APPLYING', 'ACTION_REQUIRED', 'DRY_RUN_COMPLETED',
  'SUBMITTED', 'SUBMISSION_UNCONFIRMED', 'SUBMISSION_BLOCKED',
  'CANCELLED', 'EXPIRED', 'FAILED', 'APPLIED_MANUALLY',
];

const answerSchema = new mongoose.Schema(
  {
    fieldKey:     { type: String, required: true },
    fieldLabel:   String,
    value:        String,
    factIds:      [String], // grounds this answer in specific CandidateProfile.facts[].id entries
    confidence:   { type: Number, default: 0 },
    source:       { type: String, enum: ['truth_store', 'inferred', 'manual'], default: 'truth_store' },
    verifierFlag: { type: String, enum: [null, 'ok', 'unsupported', 'needs_review'], default: null },
    // Diagnostic-only: set when an LLM call for this answer was skipped due
    // to quota/config unavailability rather than failing the application.
    llmStatus:    String,
  },
  { _id: false }
);

const applicationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jobId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Job',  required: true, index: true },

    status: { type: String, enum: STATUSES, default: 'DISCOVERED', index: true },
    statusHistory: [{ status: String, at: { type: Date, default: Date.now }, note: String }],

    // REJECTED = the evaluator's own call (eligibility.js). SKIPPED = the
    // user's own call. Kept distinct so future recommendation tuning can
    // tell "we were wrong to reject" apart from "user didn't want this one".
    eligibility: {
      passed:    Boolean,
      reasons:   [String],
      checkedAt: Date,
      llmStatus: String, // e.g. 'SKIPPED_QUOTA' — set when the LLM fallback was unavailable
    },

    // Discovery source (how we found it) vs. application platform (where the
    // apply form actually lives) — never inferred from one another. A
    // JSON-LD-discovered posting can still redirect to Workday.
    discoverySourceType: String,
    applicationPlatform: String,

    formInspection: {
      type: new mongoose.Schema({
        platform:             String,
        requiresLogin:        Boolean,
        captchaPresent:       Boolean,
        expired:              Boolean, // scraped job URL redirected to a generic "no longer open" listing page
        // `type` is a reserved word in Mongoose schema definitions — naming a
        // field `type: String` inside a nested schema gets misparsed as the
        // SchemaType declaration itself. Use `fieldType` instead; the field
        // key in DB/API stays `type` via the explicit map at the call sites.
        fields: [{
          key: String, label: String, fieldType: { type: String }, required: Boolean,
          // True when inspect.js's label-resolution heuristics found no
          // usable question text at all — surfaced to the reviewer instead
          // of silently shipping a meaningless "field_5"-style key, and used
          // by computeTier.js to force MANUAL review on the field.
          unresolvedLabel: Boolean,
          // fieldType 'checkbox-group'/'radio-group' only (see
          // form-inspector/extractFields.js's groupCheckboxes) — the
          // individual option checkboxes/radios this logical question was
          // collapsed from, so the answer agent can pick which one(s) to
          // check and apply-adapters/shared.js's fillCheckboxGroup can act
          // on each option's own key.
          options: [{ key: String, optionText: String, _id: false }],
          _id: false,
        }],
        automationCapability: { type: String, enum: ['FULL', 'PARTIAL', 'NONE'] },
        inspectedAt:          Date,
      }, { _id: false }),
      default: () => ({}),
    },

    fitScore: {
      total:      Number,
      breakdown: {
        skillMatch:       Number,
        evidenceStrength: Number,
        expGap:           Number,
        companyQuality:   Number,
        salaryPotential:  Number,
        effort:           Number,
      },
      rationale:  String,
      scoredAt:   Date,
      llmStatus:  String, // e.g. 'SKIPPED_QUOTA' — set when semantic refinement was unavailable
    },

    resumeVariantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ResumeVariant' },
    answers:         [answerSchema],

    // REVIEWED_MANUAL: set when a MANUAL-tier application is Approved as a
    // Draft (routes/applications.js's POST /:id/approve) — that action IS
    // the human review the MANUAL tier exists to require, so it clears the
    // block on a later real submit. Without this, a MANUAL-tier application
    // had no path to ever being submitted through this tool at all.
    confidenceTier: { type: String, enum: ['AUTO', 'QUICK_APPROVE', 'DRAFT_ONLY', 'MANUAL', 'REVIEWED_MANUAL'] },

    pendingQuestion: {
      question:  String,
      fieldKey:  String,
      createdAt: Date,
    },

    // Playwright storageState + progress markers — persisted so ACTION_REQUIRED
    // can close the browser and reopen/replay later rather than assuming the
    // BullMQ job's browser context survives an arbitrary wait.
    sessionState: {
      storageStatePath: String,
      currentUrl:       String,
      currentStep:      Number,
      collectedAnswers: mongoose.Schema.Types.Mixed,
    },

    auditLog: [{
      at:           { type: Date, default: Date.now },
      action:       String,
      detail:       mongoose.Schema.Types.Mixed,
      screenshotRef: String, // private storage key, never a public URL
    }],

    idempotencyKey: { type: String, index: true },

    // Set immediately before the apply-adapter's submit-button click (see
    // apply-adapters/shared.js's markSubmitAttempted), independent of and
    // earlier than confirmation/status — closes the gap where a worker
    // crash between click() and application.save() would otherwise look
    // identical to "never attempted" and get double-submitted on retry.
    submitAttemptedAt: Date,

    confirmation: {
      detected:              Boolean,
      textHash:              String,
      applicationReference:  String,
      finalUrl:               String,
    },

    // Set at discovery time to another JOB's _id (a different scraped url)
    // when that job has the same company+title+location AND this user
    // already has an Application against it within the last 30 days — see
    // utils/applicationDiscovery.js's findPossibleDuplicateJobId. Advisory
    // only, never auto-skipped (two genuinely different roles can share a
    // title/location), surfaced on the review screen so the user can skip
    // the redundant one themselves rather than unknowingly submitting two
    // applications to the same employer for what's really one job.
    possibleDuplicateOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },

    dismissed: { type: Boolean, default: false }, // carried over from UserJobState semantics
    applied:   { type: Boolean, default: false },  // denormalized convenience flag, true once SUBMITTED
    appliedAt: Date,

    // Denormalized copy of statusHistory[statusHistory.length-1].at, kept in
    // sync by utils/applicationState.js's transition() on every status
    // change. Exists purely so GET /applications can sort/paginate by "most
    // recently changed" (routes/applications.js's 'updated_recent' sort) at
    // the MongoDB query level — statusHistory is an array and can't be
    // indexed/sorted directly without loading every candidate document into
    // Node first, which is what made Issues/Done slow once REJECTED alone
    // passed several thousand documents.
    lastStatusChangeAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

applicationSchema.index({ userId: 1, jobId: 1 }, { unique: true });
applicationSchema.index({ userId: 1, status: 1, lastStatusChangeAt: -1 });

const Application = mongoose.model('Application', applicationSchema);

module.exports = { Application, STATUSES };
