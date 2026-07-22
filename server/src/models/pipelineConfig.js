const mongoose = require('mongoose');

// Singleton operational config for the agent pipeline. Lives in Mongo (not
// env) because these are product knobs a solo dev tunes live — mirrors the
// existing Source.enabled admin-toggle pattern. Env vars stay for secrets/
// infra only (GEMINI_API_KEY, REDIS_URL, APPLY_DRY_RUN).
const pipelineConfigSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: 'default' },
    confidenceThresholds: {
      autoMin:         { type: Number, default: 95 },
      quickApproveMin: { type: Number, default: 80 },
      draftOnlyMin:    { type: Number, default: 50 },
    },
    allowAutoSubmit: {
      greenhouse: { type: Boolean, default: false },
      lever:      { type: Boolean, default: false },
      ashby:      { type: Boolean, default: false },
    },
    alwaysManualFields:       { type: [String], default: () => ['salary_expectation', 'work_authorization', 'visa_status', 'criminal_history'] },
    maxApplicationsPerDayGlobal: { type: Number, default: 50 },

    // Per-stage model override — falls back to LLM_MODEL_FAST/LLM_MODEL_QUALITY
    // env vars (see llm/modelRouter.js) when a stage key is absent, so this
    // never needs to be fully populated to take effect.
    models: {
      eligibility:      String,
      fitScoring:        String,
      resumeRouting:     String,
      answerGeneration:  String,
      verifier:          String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PipelineConfig', pipelineConfigSchema);
