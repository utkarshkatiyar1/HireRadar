const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCREENSHOT_DIR = path.join(__dirname, '..', '..', 'uploads', 'screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Selectors whose values must never appear in a screenshot — password/OTP
// fields get blanked (not just hidden) before any page.screenshot() call.
// This runs even in dry-run mode, since dry-run screenshots are still stored.
async function blankSensitiveFields(page) {
  const selectors = ['input[type="password"]', 'input[name*="otp" i]', 'input[autocomplete="one-time-code"]'];
  for (const sel of selectors) {
    const count = await page.locator(sel).count();
    for (let i = 0; i < count; i++) {
      await page.locator(sel).nth(i).fill('').catch(() => {});
    }
  }
}

// Takes a screenshot AFTER blanking sensitive fields, stores it privately
// (never express.static-served — routes/applications.js's audit endpoint
// mints signed URLs instead), and returns the storage key (screenshotRef),
// never a public path.
async function takeScreenshot(page, { applicationId, label }) {
  await blankSensitiveFields(page);
  const filename = `${applicationId}-${label}-${Date.now()}.png`;
  const filePath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filePath, fullPage: true });
  return filename; // this is the screenshotRef stored on Application.auditLog
}

// Fills a field by best-effort selector strategy: by name, then id, then
// label text. Skips password/OTP-shaped fields outright — those are always
// ACTION_REQUIRED territory, never auto-filled.
const NEVER_FILL_PATTERN = /password|otp|one-time/i;

async function fillField(page, field, value) {
  if (NEVER_FILL_PATTERN.test(field.key) || NEVER_FILL_PATTERN.test(field.label || '')) {
    return { filled: false, reason: 'refused to auto-fill a password/OTP-shaped field' };
  }
  if (value == null) {
    return { filled: false, reason: 'no value to fill' };
  }

  const candidates = [
    `[name="${field.key}"]`,
    `#${field.key}`,
    `[aria-label="${field.label}"]`,
  ];

  for (const selector of candidates) {
    const locator = page.locator(selector).first();
    if (await locator.count() > 0) {
      const tag = await locator.evaluate(el => el.tagName).catch(() => null);
      if (tag === 'SELECT') {
        await locator.selectOption({ label: value }).catch(() => locator.selectOption(value));
      } else {
        await locator.fill(String(value));
      }
      return { filled: true, selector };
    }
  }

  return { filled: false, reason: 'no matching form control found for this field' };
}

// Idempotency: multi-signal check, never relying on idempotencyKey alone
// since most ATS forms don't echo it back. Call BEFORE any submit action.
function shouldSkipSubmission(application) {
  if (application.status === 'SUBMITTED') return { skip: true, reason: 'already SUBMITTED' };
  if (application.confirmation?.detected) return { skip: true, reason: 'confirmation already detected' };
  return { skip: false };
}

// Detects a submission confirmation via two independent signals: a
// recognizable confirmation-page text pattern AND a URL/DOM change from the
// pre-submit state. Requires BOTH before treating a submission as confirmed
// — a single signal (e.g. just a URL change) is too weak, since some forms
// redirect on validation errors too.
const CONFIRMATION_TEXT_PATTERNS = [
  /thank you for (your application|applying)/i,
  /application (has been )?(received|submitted|successful)/i,
  /we('ve| have) received your application/i,
];

async function detectConfirmation(page, preSubmitUrl) {
  const currentUrl = page.url();
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const textMatches = CONFIRMATION_TEXT_PATTERNS.some(re => re.test(bodyText));
  const urlChanged = currentUrl !== preSubmitUrl;

  if (textMatches && urlChanged) {
    return {
      detected: true,
      textHash: crypto.createHash('sha256').update(bodyText.slice(0, 500)).digest('hex'),
      finalUrl: currentUrl,
    };
  }
  return { detected: false, finalUrl: currentUrl };
}

// Playwright storageState persistence for ACTION_REQUIRED pause/resume —
// closes the browser rather than assuming a BullMQ job's context survives an
// arbitrary human-response wait, then reopens from this saved state.
const STORAGE_STATE_DIR = path.join(__dirname, '..', '..', 'uploads', 'session-state');
fs.mkdirSync(STORAGE_STATE_DIR, { recursive: true });

async function saveSessionState(context, applicationId) {
  const filePath = path.join(STORAGE_STATE_DIR, `${applicationId}.json`);
  await context.storageState({ path: filePath });
  return filePath;
}

function loadSessionStatePath(applicationId) {
  const filePath = path.join(STORAGE_STATE_DIR, `${applicationId}.json`);
  return fs.existsSync(filePath) ? filePath : null;
}

function clearSessionState(applicationId) {
  const filePath = path.join(STORAGE_STATE_DIR, `${applicationId}.json`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

module.exports = {
  blankSensitiveFields, takeScreenshot, fillField,
  shouldSkipSubmission, detectConfirmation,
  saveSessionState, loadSessionStatePath, clearSessionState,
};
