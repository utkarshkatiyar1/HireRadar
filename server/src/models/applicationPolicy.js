const mongoose = require('mongoose');

// User-level decisions about what the agent pipeline may do — distinct from
// PipelineConfig, which holds operational/admin settings. Keeping these
// separate avoids scattering "what am I allowed to do" logic between the
// candidate profile, agent prompts, frontend conditions, and apply adapters.
const applicationPolicySchema = new mongoose.Schema(
  {
    userId:                     { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
    allowedRoles:               [String],
    blockedCompanies:           [String],
    blockedLocations:           [String],
    minimumScore:                { type: Number, default: 65 },
    maximumExperienceGapYears:   { type: Number, default: 1 },
    minimumSalaryLPA:            Number,
    allowUnknownSalary:          { type: Boolean, default: true },
    maxApplicationsPerDay:       { type: Number, default: 10 },
    requireApprovalEveryTime:    { type: Boolean, default: true },
    autoSubmitPlatforms:         [String], // e.g. ['greenhouse'] — must also be allowed in PipelineConfig
    neverAnswerFields:           [String], // e.g. ['ssn', 'government_id']
    requireManualFields:         [String], // e.g. ['salary_expectation', 'work_authorization']

    // Data-processing/EEO-survey consent checkboxes ("By checking this box, I
    // consent to [Company] collecting, storing, and processing my
    // responses...") are near-universal on ATS demographic survey sections
    // and are almost always required to submit the form at all, but they're
    // a real legal-consent decision, not a fact lookup — defaulting this to
    // true without an explicit user choice would mean the tool silently
    // agrees to data processing on the candidate's behalf. Explicit opt-in,
    // same reasoning as neverAnswerFields being empty-by-default rather than
    // pre-populated.
    autoConsentToDataProcessing: { type: Boolean, default: false },

    // Generic marketing-attribution answer for "Where did you hear about
    // [Company]?" / "How did you hear about this opportunity?" style
    // questions — near-universal on Greenhouse/Ashby forms, always the same
    // real answer regardless of which company is asking, and carries no
    // legal/sensitivity weight (unlike visa/salary/EEO questions), so a
    // policy default is appropriate here in a way it wasn't for those.
    // Empty by default — same "state your real answer, never guess" stance
    // as everything else; this only kicks in once the user has actually set it.
    sourceAttributionAnswer: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ApplicationPolicy', applicationPolicySchema);
