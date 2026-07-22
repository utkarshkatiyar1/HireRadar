const mongoose = require('mongoose');

// Supersedes UserJobState with a richer state machine — see
// server/src/scripts/backfill-applications.js for the one-off migration and
// server/src/utils/applicationState.js for the transition helper.
const STATUSES = [
  'DISCOVERED', 'EVALUATING', 'REJECTED', 'SKIPPED',
  'READY_FOR_PREPARATION', 'INSPECTING_FORM', 'PREPARING', 'READY_FOR_APPROVAL',
  'APPROVED', 'APPLYING', 'ACTION_REQUIRED', 'DRY_RUN_COMPLETED',
  'SUBMITTED', 'SUBMISSION_UNCONFIRMED', 'SUBMISSION_BLOCKED',
  'CANCELLED', 'EXPIRED', 'FAILED',
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
        fields: [{ key: String, label: String, fieldType: { type: String }, required: Boolean, _id: false }],
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

    confidenceTier: { type: String, enum: ['AUTO', 'QUICK_APPROVE', 'DRAFT_ONLY', 'MANUAL'] },

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

    confirmation: {
      detected:              Boolean,
      textHash:              String,
      applicationReference:  String,
      finalUrl:               String,
    },

    dismissed: { type: Boolean, default: false }, // carried over from UserJobState semantics
    applied:   { type: Boolean, default: false },  // denormalized convenience flag, true once SUBMITTED
    appliedAt: Date,
  },
  { timestamps: true }
);

applicationSchema.index({ userId: 1, jobId: 1 }, { unique: true });

const Application = mongoose.model('Application', applicationSchema);

module.exports = { Application, STATUSES };
