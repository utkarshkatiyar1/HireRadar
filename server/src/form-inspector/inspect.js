const { chromium } = require('playwright');
const { detectPlatform, AUTOMATABLE_PLATFORMS } = require('./platformDetectors');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0 Safari/537.36';

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
  ];
  for (const sel of selectors) {
    if (await page.locator(sel).count() > 0) return true;
  }
  return false;
};

// Extracts visible form fields from a job application page: label + input
// type + required-ness. Best-effort, DOM-generic — real per-platform field
// mapping (e.g. Greenhouse's specific field names) lives in apply-adapters/
// at submission time; this stage only needs "what does the answer agent
// need to answer" and "can this be automated at all".
const extractFields = async (page) => {
  return page.evaluate(() => {
    const fields = [];
    const inputs = document.querySelectorAll('form input, form textarea, form select');
    inputs.forEach((el) => {
      const type = el.tagName === 'TEXTAREA' ? 'textarea' : (el.tagName === 'SELECT' ? 'select' : (el.type || 'text'));
      if (['hidden', 'submit', 'button', 'password'].includes(type)) return;

      let label = '';
      if (el.id) {
        const labelEl = document.querySelector(`label[for="${el.id}"]`);
        if (labelEl) label = labelEl.innerText.trim();
      }
      if (!label && el.closest('label')) label = el.closest('label').innerText.trim();
      if (!label) label = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || '';

      fields.push({
        key: el.name || el.id || label || `field_${fields.length}`,
        label: label.slice(0, 200),
        fieldType: type,
        required: el.required || el.getAttribute('aria-required') === 'true',
      });
    });
    return fields;
  });
};

// Opens the application URL (NO submission, ever) and extracts platform,
// login/captcha presence, and form fields. Runs on the apply-worker's
// inspectionQueue — it opens a real browser, same isolation reasoning as
// apply-adapters, so it must never share a process with pipeline-worker.
async function inspect(applyUrl) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx  = await browser.newContext({ userAgent: UA });
  const page = await ctx.newPage();

  try {
    // domcontentloaded, not networkidle — many real job-board pages never
    // reach true network idle (persistent analytics/polling), which turned
    // a fully-loaded, usable page into a hard 30s timeout failure. A short
    // settle wait covers the SPA-hydration gap that networkidle used to
    // paper over.
    await page.goto(applyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    const html = await page.content();
    const platform = detectPlatform(page.url(), html);
    const requiresLogin = await detectLoginWall(page);
    const captchaPresent = await detectCaptcha(page);
    const expired = await detectExpiredJob(page);
    const fields = (requiresLogin || expired) ? [] : await extractFields(page);

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
