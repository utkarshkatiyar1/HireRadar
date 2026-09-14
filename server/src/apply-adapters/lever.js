const { chromium } = require('playwright');
const {
  takeScreenshot, shouldSkipSubmission, markSubmitAttempted, detectConfirmation,
  saveSessionState, loadSessionStatePath, clearSessionState, findUnfilledRequiredFields,
  fillAllFields, advanceMultiStepForm,
} = require('./shared');
const { detectCaptcha } = require('../form-inspector/inspect');
const { extractFields } = require('../form-inspector/extractFields');
const { stealthContextOptions, LAUNCH_ARGS, applyStealth } = require('./stealth');

// Lever adapter — same flow as greenhouse.js (fill -> screenshot -> dry-run
// stop -> submit -> confirm), generic field-matching via shared.js since
// Lever's form field naming varies more per-company than Greenhouse's.
async function submitLever({ application, job, resumeVariant }) {
  const dryRun = process.env.APPLY_DRY_RUN !== 'false';
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
    // a fully-loaded, usable page into a hard 30s timeout failure.
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);

    // Lever postings often need an explicit "Apply for this job" click to
    // reveal the form.
    const applyButton = page.locator('a:has-text("Apply for this job"), a.postings-btn').first();
    if (await applyButton.count() > 0) {
      await applyButton.click().catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    }

    const answersByKey = new Map(application.answers.map(a => [a.fieldKey, a]));
    const fillResults = [];

    await fillAllFields(page, application.formInspection?.fields || [], answersByKey, fillResults);
    await advanceMultiStepForm(page, application, answersByKey, fillResults, extractFields);

    if (resumeVariant?.storageKey) {
      // Match the resume's own field, not just the first file input on the
      // page — see greenhouse.js's equivalent comment for why (some forms
      // have a separate cover_letter file input too, and blind .first()
      // risks uploading to the wrong slot or none at all).
      const resumeField = (application.formInspection?.fields || [])
        .find(f => f.fieldType === 'file' && /resume|cv/i.test(`${f.key} ${f.label}`));
      const resumeInput = resumeField
        ? page.locator(`[name="${resumeField.key}"], #${resumeField.key}`).first()
        : page.locator('input[name="resume"], input[type="file"]').first();
      if (await resumeInput.count() > 0) {
        const resumePath = require('path').join(__dirname, '..', '..', 'uploads', 'resumes', resumeVariant.storageKey);
        // force: true — see greenhouse.js's equivalent comment: real file
        // inputs are commonly hidden behind a styled button, and Playwright's
        // default visibility check otherwise rejects a genuinely working input.
        await resumeInput.setInputFiles(resumePath, { force: true }).then(() => {
          fillResults.push({ fieldKey: 'resume', filled: true });
        }).catch(() => {
          fillResults.push({ fieldKey: 'resume', filled: false, reason: 'file input not accessible' });
        });
      }
    }

    const preSubmitUrl = page.url();
    const preSubmitScreenshotRef = await takeScreenshot(page, { applicationId: application._id, label: 'pre-submit' });

    // Re-detected LIVE — see greenhouse.js's equivalent comment for why
    // formInspection.captchaPresent can't be trusted here.
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
      clearSessionState(application._id.toString());
      return { outcome: 'DRY_RUN_COMPLETED', screenshotRef: preSubmitScreenshotRef, fillResults };
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

    return { outcome: 'SUBMISSION_UNCONFIRMED', confirmation, screenshotRef: postSubmitScreenshotRef, fillResults };
  } finally {
    await browser.close();
  }
}

module.exports = submitLever;
