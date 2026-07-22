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
  },
  { timestamps: true }
);

module.exports = mongoose.model('ApplicationPolicy', applicationPolicySchema);
