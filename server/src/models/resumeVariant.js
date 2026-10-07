const mongoose = require('mongoose');

// A small, user-curated set of resume files (e.g. "Frontend-React",
// "Fullstack-Generic"). The Resume Routing agent picks among these by tag
// overlap — it never generates a new resume from scratch.
const resumeVariantSchema = new mongoose.Schema(
  {
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label:    { type: String, required: true },
    tags:     [String], // matched against JD signals for routing
    isDefault: { type: Boolean, default: false },

    // File identity — sha256 lets the audit trail prove exactly which resume
    // bytes were submitted for a given application.
    storageProvider:  { type: String, enum: ['LOCAL', 'S3'], default: 'LOCAL' },
    storageKey:       { type: String, required: true },
    originalFileName: String,
    mimeType:         String,
    size:             Number,
    sha256:           { type: String, index: true },
    version:          { type: Number, default: 1 },
    extractedText:    String, // plain-text extraction, used by fit-scoring/resume-routing agents
    isActive:         { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ResumeVariant', resumeVariantSchema);
