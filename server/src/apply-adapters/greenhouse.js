const { chromium } = require('playwright');
const {
  takeScreenshot, shouldSkipSubmission, markSubmitAttempted, detectConfirmation,
  saveSessionState, loadSessionStatePath, clearSessionState, findUnfilledRequiredFields,
  fillAllFields, advanceMultiStepForm,
} = require('./shared');
const { detectCaptcha } = require('../form-inspector/inspect');
const { extractFields } = require('../form-inspector/extractFields');
const { stealthContextOptions, LAUNCH_ARGS, applyStealth } = require('./stealth');

// Simplest of the three ATS adapters — matches existing scrapers/ats/greenhouse.js
// site structure, and is why it's built first per the plan's staged order.
// Fills known form fields from application.answers, uploads the selected
// resume, and — under APPLY_DRY_RUN — stops before the final submit click.
//
// Resumable: if a prior run paused for ACTION_REQUIRED, this reopens from
// the saved storageState/currentStep rather than starting over.
async function submitGreenhouse({ application, job, resumeVariant }) {
  const dryRun = process.env.APPLY_DRY_RUN !== 'false'; // default true — dry-run always wins
  const skipCheck = shouldSkipSubmission(application);
  if (skipCheck.skip) {
    return { outcome: 'SKIPPED', reason: skipCheck.reason };
  }

  const resumeStatePath = loadSessionStatePath(application._id.toString());
  const browser = await chromium.launch({
    headless: true,
    args: LAUNCH_ARGS,
  });

  const ctx = await browser.newContext({
    ...stealthContextOptions(),
    ...(resumeStatePath ? { storageState: resumeStatePath } : {}),
  });
  await applyStealth(ctx);
  const page = await ctx.newPage();

  try {
    const startUrl = application.sessionState?.currentUrl || job.url;
    // domcontentloaded, not networkidle — many real job-board pages never
    // reach true network idle (persistent analytics/polling), which turned
    // a fully-loaded, usable page into a hard 30s timeout failure. This
    // exact failure mode is what motivated this change.
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);

    const answersByKey = new Map(application.answers.map(a => [a.fieldKey, a]));
    const fillResults = [];

    await fillAllFields(page, application.formInspection?.fields || [], answersByKey, fillResults);

    // Multi-step forms (Personal Info -> Experience -> Questions -> Review)
    // reveal later steps' fields only after a "Next"/"Continue" click — see
    // shared.js's advanceMultiStepForm for why a single fill-pass previously
    // either falsely reported SUBMITTED on a step-advance or left later-step
    // required fields unfilled with no signal at all.
    await advanceMultiStepForm(page, application, answersByKey, fillResults, extractFields);

    if (resumeVariant?.storageKey) {
      // Match the resume's own field (formInspection key/label — Greenhouse
      // forms often have BOTH a resume and a cover_letter file input, so
      // blindly grabbing input[type="file"].first() risks uploading to
      // whichever one happens to come first in DOM order, or uploading
      // nothing at all if it's the cover letter slot instead.
      const resumeField = (application.formInspection?.fields || [])
        .find(f => f.fieldType === 'file' && /resume|cv/i.test(`${f.key} ${f.label}`));
      const resumeInput = resumeField
        ? page.locator(`[name="${resumeField.key}"], #${resumeField.key}`).first()
        : page.locator('input[type="file"]').first();
      if (await resumeInput.count() > 0) {
        const resumePath = require('path').join(__dirname, '..', '..', 'uploads', 'resumes', resumeVariant.storageKey);
        // force: true — real file inputs are very commonly display:none/
        // visually hidden behind a styled "Attach" button that triggers the
        // native picker via JS. Playwright's default actionability check
        // (visible + enabled) rejects setInputFiles on a hidden input even
        // though it's a real, functional element — force bypasses that
        // specific check only, it doesn't skip DOM validity.
        await resumeInput.setInputFiles(resumePath, { force: true }).then(() => {
          fillResults.push({ fieldKey: 'resume', filled: true });
        }).catch(() => {
          fillResults.push({ fieldKey: 'resume', filled: false, reason: 'file input not accessible' });
        });
      }
    }

    const preSubmitUrl = page.url();
    const preSubmitScreenshotRef = await takeScreenshot(page, { applicationId: application._id, label: 'pre-submit' });

    // OTP/CAPTCHA check — if either is present at this point, pause rather
    // than attempt to submit past it. Re-detected LIVE, never trusted from
    // formInspection.captchaPresent: that snapshot can be stale by the time
    // this adapter reopens the page (minutes/hours later, a different
    // session) — a real incident had a job inspect clean and then present a
    // hidden hCaptcha submit button at actual submit time, which a blind
    // submitButton.click() hung on for 30s instead of ever detecting.
    const hasPasswordField = await page.locator('input[type="password"]').count() > 0;
    const hasCaptcha = await detectCaptcha(page);
    if (hasPasswordField || hasCaptcha) {
      await saveSessionState(ctx, application._id.toString());
      return {
        outcome: 'ACTION_REQUIRED',
        pendingQuestion: {
          question: hasCaptcha ? 'CAPTCHA must be solved manually before this application can be submitted.' : 'A login/verification step blocked automated submission.',
          fieldKey: hasCaptcha ? 'captcha' : 'login',
        },
        screenshotRef: preSubmitScreenshotRef,
        fillResults,
      };
    }

    // A required field (often a dropdown with no matching option — see
    // shared.js's fillSelect) that failed to fill must not silently reach
    // submit — that previously shipped an incomplete application with no
    // gate at all beyond a human noticing it later in the audit log.
    const unfilledRequired = findUnfilledRequiredFields(application.formInspection?.fields, fillResults);
    if (unfilledRequired.length) {
      await saveSessionState(ctx, application._id.toString());
      return {
        outcome: 'ACTION_REQUIRED',
        pendingQuestion: {
          question: `Could not fill required field(s): ${unfilledRequired.map(f => f.label || f.key).join(', ')}. Fill manually and continue.`,
          fieldKey: unfilledRequired[0].key,
        },
        screenshotRef: preSubmitScreenshotRef,
        fillResults,
      };
    }

    if (dryRun) {
      // Dry-run NEVER clicks submit — logs the would-be action and returns
      // DRY_RUN_COMPLETED, never SUBMITTED, so real analytics/idempotency
      // state is never contaminated by a test run.
      clearSessionState(application._id.toString());
      return {
        outcome: 'DRY_RUN_COMPLETED',
        screenshotRef: preSubmitScreenshotRef,
        fillResults,
      };
    }

    const submitButton = page.locator('button[type="submit"], input[type="submit"]').first();
    await markSubmitAttempted(application._id);
    await submitButton.click();
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

    const confirmation = await detectConfirmation(page, preSubmitUrl);
    const postSubmitScreenshotRef = await takeScreenshot(page, { applicationId: application._id, label: 'post-submit' });

    if (confirmation.detected) {
      clearSessionState(application._id.toString());
      return { outcome: 'SUBMITTED', confirmation, screenshotRef: postSubmitScreenshotRef, fillResults };
    }

    // Ambiguous — never auto-retry, since retrying risks a real double-application.
    return { outcome: 'SUBMISSION_UNCONFIRMED', confirmation, screenshotRef: postSubmitScreenshotRef, fillResults };
  } finally {
    await browser.close();
  }
}

module.exports = submitGreenhouse;
