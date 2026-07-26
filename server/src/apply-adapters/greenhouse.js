const { chromium } = require('playwright');
const {
  takeScreenshot, fillField, shouldSkipSubmission, detectConfirmation,
  saveSessionState, loadSessionStatePath, clearSessionState,
} = require('./shared');
const { detectCaptcha } = require('../form-inspector/inspect');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0 Safari/537.36';

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
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const ctx = await browser.newContext({
    userAgent: UA,
    ...(resumeStatePath ? { storageState: resumeStatePath } : {}),
  });
  const page = await ctx.newPage();

  try {
    const startUrl = application.sessionState?.currentUrl || job.url;
    await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 30000 });

    const answersByKey = new Map(application.answers.map(a => [a.fieldKey, a]));
    const fillResults = [];

    for (const field of application.formInspection?.fields || []) {
      const answer = answersByKey.get(field.key);
      if (!answer || answer.value == null) continue; // never fill from a blank/unanswered field
      const result = await fillField(page, field, answer.value);
      fillResults.push({ fieldKey: field.key, ...result });
    }

    if (resumeVariant?.storageKey) {
      const resumeInput = page.locator('input[type="file"]').first();
      if (await resumeInput.count() > 0) {
        const resumePath = require('path').join(__dirname, '..', '..', 'uploads', 'resumes', resumeVariant.storageKey);
        await resumeInput.setInputFiles(resumePath).catch(() => {
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
