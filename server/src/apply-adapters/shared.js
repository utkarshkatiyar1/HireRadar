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

  if (field.fieldType === 'checkbox-group' || field.fieldType === 'radio-group') {
    return await fillCheckboxGroup(page, field, value);
  }

  const candidates = [
    `[name="${field.key}"]`,
    `#${field.key}`,
    `[aria-label="${field.label}"]`,
  ];

  for (const selector of candidates) {
    const locator = page.locator(selector).first();
    if (await locator.count() > 0) {
      const inputType = await locator.evaluate(el =>
        el.tagName === 'SELECT' ? 'select' : (el.type || '').toLowerCase()
      ).catch(() => null);

      if (inputType === 'select') {
        return await fillSelect(locator, value);
      }
      if (inputType === 'checkbox' || inputType === 'radio') {
        // Playwright's .fill() throws on checkbox/radio inputs — they need
        // .setChecked(bool), not a text value. This previously meant every
        // checkbox field (consent checkboxes, "select all that apply"
        // options, EEO opt-ins) silently failed to fill: fillField's .fill()
        // call threw, was caught by the adapter's outer .catch() per field,
        // and recorded filled:false — a required consent checkbox (very
        // common on demographic/EEO survey sections, e.g. Twilio's "By
        // checking this box, I consent to...") would then either block
        // submission via findUnfilledRequiredFields (if required) or, worse,
        // silently leave an OPTIONAL consent box unchecked with no signal at
        // all, when the candidate's actual answer was "yes, I consent."
        const shouldCheck = isAffirmative(value);
        await locator.setChecked(shouldCheck);
        return { filled: true, selector, checked: shouldCheck };
      }

      await locator.fill(String(value));
      return { filled: true, selector };
    }
  }

  return { filled: false, reason: 'no matching form control found for this field' };
}

// Checks the option(s) selected by answerAgent.js for a checkbox-group/
// radio-group field (see form-inspector/extractFields.js's groupCheckboxes).
// value is one or more of the group's optionText strings joined by "|" —
// this resolves each back to its real option key and checks/selects it,
// rather than the individual-checkbox path in fillField, which has no
// concept of "this is one of several related options."
async function fillCheckboxGroup(page, field, value) {
  const chosenTexts = String(value).split('|').map(v => v.trim());
  const results = [];

  for (const opt of field.options || []) {
    const shouldSelect = chosenTexts.includes(opt.optionText);
    if (!shouldSelect) continue; // leave unlisted options at their default (unchecked)

    const locator = page.locator(`[name="${opt.key}"], #${opt.key}`).first();
    if (await locator.count() === 0) {
      results.push({ optionText: opt.optionText, filled: false, reason: 'option control not found' });
      continue;
    }

    try {
      if (field.fieldType === 'radio-group') {
        await locator.check();
      } else {
        await locator.setChecked(true);
      }
      results.push({ optionText: opt.optionText, filled: true });
    } catch (e) {
      results.push({ optionText: opt.optionText, filled: false, reason: e.message });
    }
  }

  const anyFailed = results.some(r => !r.filled);
  const anySucceeded = results.some(r => r.filled);
  return {
    filled: anySucceeded && !anyFailed,
    reason: anyFailed ? `some options failed to check: ${JSON.stringify(results.filter(r => !r.filled))}` : undefined,
  };
}

// Consent/EEO-opt-in checkboxes get a boolean answer from the answer agent
// (see answerAgent.js's CONSENT_CHECKBOX_TEST), but LLM output and manual
// overrides can still arrive as "true"/"yes"/"I agree"/boolean true — accept
// the common affirmative spellings rather than requiring one exact shape.
function isAffirmative(value) {
  if (typeof value === 'boolean') return value;
  const v = String(value).trim().toLowerCase();
  return ['true', 'yes', 'y', 'i agree', 'i consent', 'checked', 'on', '1'].includes(v);
}

// Dropdown fill was previously a single blind attempt (exact label, then
// exact value) — real ATS forms routinely phrase an option differently than
// the LLM-drafted answer ("5 to 7 years" vs the drafted "5-7 years", "Yes" vs
// "Yes, I am authorized"), so an exact-match-only strategy failed silently:
// fillField caught the throw, recorded filled:false in fillResults, and
// nothing about that failure stopped the adapter from clicking submit
// anyway with a required dropdown left at its default/blank option. This
// tries exact match first, then a case-insensitive substring match against
// every option's visible text before giving up.
async function fillSelect(locator, value) {
  try {
    await locator.selectOption({ label: value });
    return { filled: true };
  } catch {}
  try {
    await locator.selectOption(value);
    return { filled: true };
  } catch {}

  const target = String(value).toLowerCase().trim();
  const options = await locator.locator('option').allTextContents();
  const matchIdx = options.findIndex(opt => {
    const o = opt.toLowerCase().trim();
    return o === target || o.includes(target) || target.includes(o);
  });
  if (matchIdx >= 0) {
    await locator.selectOption({ index: matchIdx });
    return { filled: true, fuzzyMatched: true };
  }

  return { filled: false, reason: `no dropdown option matched drafted value "${value}"` };
}

// Idempotency: multi-signal check, never relying on idempotencyKey alone
// since most ATS forms don't echo it back. Call BEFORE any submit action.
//
// submitAttemptedAt closes a real double-submit gap: if the worker process
// crashes (OOM, restart) after submitButton.click() but before the
// adapter's return value reaches applyProcessor.js's application.save(),
// the DB still shows status APPLYING with no confirmation — indistinguishable
// from "never attempted." A BullMQ retry (or stalled-job requeue) would then
// relaunch the browser and click submit again on the real ATS form. Once a
// submit click has actually happened, this field is persisted immediately
// (see markSubmitAttempted below) so any later attempt on this application
// treats it as unconfirmed-but-possibly-submitted rather than safe to retry.
function shouldSkipSubmission(application) {
  if (application.status === 'SUBMITTED') return { skip: true, reason: 'already SUBMITTED' };
  if (application.confirmation?.detected) return { skip: true, reason: 'confirmation already detected' };
  if (application.submitAttemptedAt) {
    return { skip: true, reason: 'a submit click was already attempted for this application and never confirmed — requires manual reconciliation, will not auto-retry' };
  }
  return { skip: false };
}

// Called immediately before the adapter's submitButton.click() — persists
// directly (not via the caller's in-memory `application` + a later .save(),
// which is exactly the window a crash can fall into) so the marker survives
// even if the process dies in the next line.
async function markSubmitAttempted(applicationId) {
  const { Application } = require('../models/application');
  await Application.updateOne({ _id: applicationId }, { $set: { submitAttemptedAt: new Date() } });
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

// Multi-step forms (Personal Info -> Experience -> Questions -> Review, very
// common on Ashby/Greenhouse custom flows) were previously invisible to
// every adapter: each one did a single fill-pass, took one screenshot, then
// clicked whatever it identified as "the submit button." On a multi-step
// form that button only advances to the next step — the adapter had no way
// to tell "this click advanced to step 2" from "this click actually
// submitted," so it either treated a step-advance as SUBMITTED (a false
// positive with no real application on file) or the confirmation-detection
// check correctly failed to find a real confirmation and it fell through to
// SUBMISSION_UNCONFIRMED despite the form never having reached a real submit
// button at all.
//
// This detects which situation happened by re-extracting fields after the
// click: brand new required fields appearing (that weren't on the page
// before) means it was a step-advance, not a real submit — the caller
// should fill those and click again. Bounded at MAX_STEPS since an
// infinite/broken loop here must not hang a worker forever.
const MAX_STEPS = 6;

async function fillAllFields(page, formFields, answersByKey, fillResults) {
  for (const field of formFields) {
    if (fillResults.some(r => r.fieldKey === field.key)) continue; // already filled in an earlier step
    const answer = answersByKey.get(field.key);
    if (!answer || answer.value == null) continue;
    const result = await fillField(page, field, answer.value);
    fillResults.push({ fieldKey: field.key, ...result });
  }
}

// Runs the fill -> click "next/continue" -> re-extract loop. Returns once
// either a genuinely new step's fields have all been filled and no further
// step-advance is detected (caller proceeds to the real submit-button
// check), or MAX_STEPS is hit (caller proceeds anyway — better to attempt a
// real submit on whatever the current step is than hang indefinitely).
//
// extractFieldsFn is injected (form-inspector/extractFields.js's
// extractFields) rather than imported directly, avoiding a
// form-inspector <-> apply-adapters circular require.
async function advanceMultiStepForm(page, application, answersByKey, fillResults, extractFieldsFn) {
  const nextButtonSelectors = [
    'button:has-text("Next")', 'button:has-text("Continue")',
    'input[type="button"][value*="Next" i]', 'input[type="button"][value*="Continue" i]',
  ];

  for (let step = 0; step < MAX_STEPS; step++) {
    const nextButton = page.locator(nextButtonSelectors.join(', ')).first();
    if (await nextButton.count() === 0) return; // no step-advance control on this page — nothing more to do

    const beforeUrl = page.url();
    await nextButton.click().catch(() => {});
    await page.waitForTimeout(1000);
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});

    const freshFields = await extractFieldsFn(page);
    // Merge into application.formInspection.fields so the caller's later
    // findUnfilledRequiredFields check (and the persisted audit trail) sees
    // every field across every step, not just the first step's snapshot.
    const knownKeys = new Set((application.formInspection?.fields || []).map(f => f.key));
    const newFields = freshFields.filter(f => !knownKeys.has(f.key));

    if (!newFields.length) {
      // Nothing new appeared — either the click did nothing (not really a
      // step-advance control, e.g. a "Next" link unrelated to the form) or
      // we've reached the final step already. Either way, stop advancing.
      return;
    }

    application.formInspection.fields = [...(application.formInspection.fields || []), ...newFields];
    await fillAllFields(page, newFields, answersByKey, fillResults);
  }
}

// Previously a required dropdown/field left unfilled (fillField returning
// filled:false) didn't itself block submission — it just showed up in
// fillResults for later human inspection of the audit log, AFTER the submit
// may have already gone through. Called by every adapter right before the
// submit-button click; any required field that failed to fill routes to
// ACTION_REQUIRED instead of silently submitting an incomplete form.
function findUnfilledRequiredFields(formFields, fillResults) {
  const failedKeys = new Set(fillResults.filter(r => r.filled === false).map(r => r.fieldKey));
  return (formFields || []).filter(f => f.required && failedKeys.has(f.key));
}

module.exports = {
  blankSensitiveFields, takeScreenshot, fillField,
  shouldSkipSubmission, markSubmitAttempted, detectConfirmation,
  saveSessionState, loadSessionStatePath, clearSessionState,
  findUnfilledRequiredFields, fillAllFields, advanceMultiStepForm,
};
