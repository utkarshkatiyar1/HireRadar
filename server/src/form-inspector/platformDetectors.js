// Maps an apply URL / page content to a known ATS platform. This is
// deliberately separate from Job.ats (the DISCOVERY source) — a job found
// via JSON-LD or a generic careers page can still redirect to any of these
// platforms for the actual application form, so detection happens fresh
// against the real apply URL rather than being inherited from how the job
// was discovered.
const DETECTORS = [
  { platform: 'GREENHOUSE', test: (url) => /greenhouse\.io/i.test(url) },
  { platform: 'LEVER',      test: (url) => /lever\.co/i.test(url) },
  { platform: 'ASHBY',      test: (url) => /ashbyhq\.com/i.test(url) },
  { platform: 'WORKDAY',    test: (url) => /myworkdayjobs\.com/i.test(url) },
  { platform: 'SMARTRECRUITERS', test: (url) => /smartrecruiters\.com/i.test(url) },
];

const detectPlatform = (url, html = '') => {
  const text = `${url}\n${html}`;
  for (const { platform, test } of DETECTORS) {
    if (test(text)) return platform;
  }
  return 'CUSTOM';
};

// Platforms with a known, auto-fillable form structure (feeds Milestone 6's
// apply-adapters). Anything else is PARTIAL/NONE regardless of field extraction
// success — inspection can still see the fields, but automation isn't trusted.
const AUTOMATABLE_PLATFORMS = new Set(['GREENHOUSE', 'LEVER', 'ASHBY']);

module.exports = { detectPlatform, AUTOMATABLE_PLATFORMS };
