// Label-text patterns for the same sensitive categories alwaysManualFields
// covers by fieldKey. Needed because many ATS platforms (confirmed on
// Ashby/Greenhouse custom questions) generate opaque, non-semantic field
// keys like "question_18273" for form-builder-authored questions — a key-only
// match against alwaysManualFields silently never fires for those, even
// though the visible label is unambiguously "Do you require visa
// sponsorship?" or "Have you ever been convicted of a felony?". This is the
// one policy explicitly meant to keep salary/visa/criminal-history questions
// out of full automation, so a bypass here defeats its entire purpose.
const SENSITIVE_LABEL_PATTERNS = [
  /salary|compensation|pay expectation/i,
  // "eligible to work"/"authorized to work" alone (no "visa"/"sponsorship"/
  // "legally") previously did NOT match this pattern — a real gap: a
  // Bloomreach Greenhouse form asked "Are you currently eligible to work in
  // [country]?" as its own separate question from visa sponsorship, and an
  // application whose only low-confidence/blank field was this one could in
  // principle have slipped through above MANUAL tier despite being exactly
  // the class of question this list exists to catch.
  /work authoriz|visa|sponsorship|right to work|eligible to work|authorized to work|legally (authorized|eligible) to work/i,
  /criminal|felony|conviction|background check/i,
  /disability|veteran status|race|ethnicity|gender identity|sexual orientation/i, // EEO/voluntary self-ID questions — same sensitivity class
];

// Pure function — confidence tier from the lowest-confidence answer plus
// presence of any always-manual / policy-required-manual fields.
// thresholds = PipelineConfig.confidenceThresholds { autoMin, quickApproveMin, draftOnlyMin }
module.exports = function computeTier({ answers, alwaysManualFields = [], requireManualFields = [], thresholds }) {
  const manualFieldKeys = new Set([...alwaysManualFields, ...requireManualFields]);
  const hasAlwaysManualField = answers.some(a =>
    manualFieldKeys.has(a.fieldKey) || SENSITIVE_LABEL_PATTERNS.some(re => re.test(a.fieldLabel || ''))
  );
  if (hasAlwaysManualField) return 'MANUAL';

  const minConfidence = answers.length
    ? Math.min(...answers.map(a => a.confidence ?? 0))
    : 0;

  if (minConfidence >= thresholds.autoMin) return 'AUTO';
  if (minConfidence >= thresholds.quickApproveMin) return 'QUICK_APPROVE';
  if (minConfidence >= thresholds.draftOnlyMin) return 'DRAFT_ONLY';
  return 'MANUAL';
};
