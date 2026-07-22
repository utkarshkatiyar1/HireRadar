// Pure function — confidence tier from the lowest-confidence answer plus
// presence of any always-manual / policy-required-manual fields.
// thresholds = PipelineConfig.confidenceThresholds { autoMin, quickApproveMin, draftOnlyMin }
module.exports = function computeTier({ answers, alwaysManualFields = [], requireManualFields = [], thresholds }) {
  const manualFieldKeys = new Set([...alwaysManualFields, ...requireManualFields]);
  const hasAlwaysManualField = answers.some(a => manualFieldKeys.has(a.fieldKey));
  if (hasAlwaysManualField) return 'MANUAL';

  const minConfidence = answers.length
    ? Math.min(...answers.map(a => a.confidence ?? 0))
    : 0;

  if (minConfidence >= thresholds.autoMin) return 'AUTO';
  if (minConfidence >= thresholds.quickApproveMin) return 'QUICK_APPROVE';
  if (minConfidence >= thresholds.draftOnlyMin) return 'DRAFT_ONLY';
  return 'MANUAL';
};
