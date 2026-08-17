const { chromium } = require('playwright');
const { detectPlatform, AUTOMATABLE_PLATFORMS } = require('./platformDetectors');
const { stealthContextOptions, LAUNCH_ARGS, applyStealth } = require('../apply-adapters/stealth');
const { extractFields } = require('./extractFields');

// Detects login walls by looking for password inputs or common login-page
// markers — a page requiring login can't be safely auto-filled with the
// candidate's application data.
const detectLoginWall = async (page) => {
  const hasPasswordField = await page.locator('input[type="password"]').count() > 0;
  const bodyText = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
  const loginMarkers = ['sign in to apply', 'log in to continue', 'create an account to apply'];
  return hasPasswordField || loginMarkers.some(m => bodyText.includes(m));
};

// Detects a job posting that's expired/closed and redirected to a generic
// listing page — a real failure mode discovered via live testing: a
// scraped URL can go stale between scrape time and prepare time, and the
// ATS redirects to its careers board instead of 404ing. Zero form fields on
// an expired-job redirect must NOT be treated the same as zero fields on a
// genuinely automatable (just-not-yet-filled) form.
const EXPIRED_JOB_MARKERS = [
  'is no longer open', 'position has been filled', 'no longer accepting applications',
  'job you are looking for is no longer', 'this posting is no longer available',
  'job not found', 'was not found', 'job you requested was not found',
];

const detectExpiredJob = async (page) => {
  const bodyText = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
  return EXPIRED_JOB_MARKERS.some(m => bodyText.includes(m));
};

// CAPTCHA detection via common widget markers (reCAPTCHA/hCaptcha/Cloudflare
// Turnstile iframes or script tags) — presence alone is enough to flag
// automationCapability as PARTIAL/NONE; we never attempt to bypass it.
// Exported so apply-adapters re-run this LIVE at submit time rather than
// trusting the formInspection.captchaPresent snapshot taken at prepare time
// — a real incident: a job inspected clean (captchaPresent: false) had an
// hCaptcha widget present by the time the apply-worker reopened the page
// minutes/hours later, and the adapter's blind submit-button click hung for
// 30s on a hidden `#hcaptchaSubmitBtn` instead of detecting the CAPTCHA and
// routing to ACTION_REQUIRED like it's supposed to. The extra id/class
// selectors below also directly cover that pattern (submit buttons named
// after the CAPTCHA provider even without a standard widget marker).
const detectCaptcha = async (page) => {
  const selectors = [
    'iframe[src*="recaptcha"]', 'iframe[src*="hcaptcha"]', 'iframe[src*="turnstile"]',
    '.g-recaptcha', '#h-captcha', '[data-sitekey]',
    '[id*="captcha" i]', '[class*="captcha" i]',
    // A real incident: reCAPTCHA (particularly invisible v3) injects a
    // hidden textarea[name="g-recaptcha-response"] into the DOM even when
    // the visible widget iframe/.g-recaptcha div hasn't rendered yet or
    // isn't present in a form the selectors above matched — this hidden
    // element is reCAPTCHA's own response token field, not a real question,
    // but form-inspector/extractFields.js's generic "any input/textarea"
    // scan had no way to know that and extracted it as an answerable field
    // (shipped to the review UI as "g-recaptcha-response", 0% confidence,
    // no matching fact). Checking for this element directly here means
    // CAPTCHA presence is caught even when the visible widget alone isn't.
    'textarea[name="g-recaptcha-response"]', 'input[name="g-recaptcha-response"]',
  ];
  for (const sel of selectors) {
    if (await page.locator(sel).count() > 0) return true;
  }
  return false;
};

// Opens the application URL (NO submission, ever) and extracts platform,
// login/captcha presence, and form fields. Runs on the apply-worker's
// inspectionQueue — it opens a real browser, same isolation reasoning as
// apply-adapters, so it must never share a process with pipeline-worker.
async function inspect(applyUrl) {
  const browser = await chromium.launch({
    headless: true,
    args: LAUNCH_ARGS,
  });
  const ctx  = await browser.newContext(stealthContextOptions());
  await applyStealth(ctx);
  const page = await ctx.newPage();

  try {
    // domcontentloaded, not networkidle — many real job-board pages never
    // reach true network idle (persistent analytics/polling), which turned
    // a fully-loaded, usable page into a hard 30s timeout failure. A short
    // settle wait covers the SPA-hydration gap that networkidle used to
    // paper over.
    await page.goto(applyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    // Some platforms (confirmed on Ashby) show only a job overview page —
    // the actual application form lives behind a separate "Apply" link/
    // button, sometimes a real navigation to a different URL rather than a
    // same-page reveal. Without this, inspection saw 0 fields on the
    // overview page and marked the job automationCapability: NONE even
    // though the real application page was fully fillable. Harmless no-op
    // if no such link exists (Greenhouse pages already show the form directly).
    const applyLink = page.locator(
      'a:has-text("Apply for this job"), a:has-text("Apply for this Job"), a:has-text("Apply now"), button:has-text("Apply for this job"), button:has-text("Apply for this Job")'
    ).first();
    if (await applyLink.count() > 0) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {}),
        applyLink.click().catch(() => {}),
      ]);
      await page.waitForTimeout(1500);
    }

    const html = await page.content();
    const platform = detectPlatform(page.url(), html);
    const requiresLogin = await detectLoginWall(page);
    const captchaPresent = await detectCaptcha(page);
    const expired = await detectExpiredJob(page);
    const fields = (requiresLogin || expired) ? [] : await extractFields(page);

    // Diagnostic log — a real incident had automationCapability come back
    // NONE on a form that a human confirmed (by opening the real page) has
    // a full set of fillable fields, and there was no visibility into WHICH
    // of requiresLogin/expired/fields.length=0 actually caused it without
    // guessing. Cheap enough to always run; strip once the current
    // investigation is resolved if it's just noise by then.
    console.log(`[inspect] ${applyUrl} -> platform=${platform} requiresLogin=${requiresLogin} captchaPresent=${captchaPresent} expired=${expired} fieldCount=${fields.length}`);

    let automationCapability = 'NONE';
    if (expired) {
      // Never trust a platform's "usually automatable" reputation when the
      // posting itself is gone — this is the case that motivated adding
      // this check: a stale scraped URL redirected to a generic listing
      // page, and zero fields there must not be read as "a clean automatable form".
      automationCapability = 'NONE';
    } else if (!requiresLogin && !captchaPresent && fields.length > 0 && AUTOMATABLE_PLATFORMS.has(platform)) {
      automationCapability = 'FULL';
    } else if (!requiresLogin && fields.length > 0) {
      automationCapability = 'PARTIAL';
    }

    return {
      platform,
      requiresLogin,
      captchaPresent,
      expired,
      fields,
      automationCapability,
      inspectedAt: new Date(),
    };
  } finally {
    await browser.close();
  }
}

module.exports = inspect;
module.exports.detectCaptcha = detectCaptcha;
