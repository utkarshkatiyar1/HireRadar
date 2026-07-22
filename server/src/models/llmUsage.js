const mongoose = require('mongoose');

// Application-level LLM usage ledger — tracked independently of whatever the
// provider itself reports, so a free-tier daily cap can be enforced BEFORE
// hitting the provider's own quota wall (cleaner failure mode, and lets us
// stop calling once we're confident we're near the free-tier boundary rather
// than finding out via a 429).
const llmUsageSchema = new mongoose.Schema(
  {
    date:                  { type: String, required: true, index: true }, // YYYY-MM-DD (UTC), cheap daily bucketing
    provider:              { type: String, required: true },
    model:                 { type: String, required: true },
    stage:                 { type: String, required: true },
    requestCount:          { type: Number, default: 1 },
    estimatedInputTokens:  { type: Number, default: 0 },
    estimatedOutputTokens: { type: Number, default: 0 },
    success:               { type: Boolean, required: true },
    errorType:             String, // one of the llm/errors.js class names, if !success
  },
  { timestamps: true }
);

llmUsageSchema.index({ date: 1, provider: 1 });

module.exports = mongoose.model('LlmUsage', llmUsageSchema);
