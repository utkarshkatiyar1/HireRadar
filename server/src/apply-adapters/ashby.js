const { chromium } = require('playwright');
const {
  takeScreenshot, shouldSkipSubmission, markSubmitAttempted, detectConfirmation,
  saveSessionState, loadSessionStatePath, clearSessionState, findUnfilledRequiredFields,
  fillAllFields, advanceMultiStepForm,
} = require('./shared');
const { detectCaptcha } = require('../form-inspector/inspect');
const { extractFields } = require('../form-inspector/extractFields');
const { stealthContextOptions, LAUNCH_ARGS, applyStealth } = require('./stealth');

// Ashby adapter — same flow as greenhouse.js/lever.js. Confirmed via direct
// inspection: Ashby job OVERVIEW pages have zero form fields at all — the
// real application form lives on a separate /application sub-path, reached
// via an "Apply for this Job" link that does a real navigation (not a
// same-page reveal like Lever's). Every field this adapter fills comes from
// formInspection.fields, which form-inspector/inspect.js now populates by
// following that same link first — this adapter must do the same or it'll
// try to fill fields into the wrong (fieldless) page.
async function submitAshby({ application, job, resumeVariant }) {
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

    // SPA hydration — give the form time to render before locating fields.
    await page.waitForTimeout(1500);

    // Follow "Apply for this Job" if present — see the adapter-level comment
    // above. Skipped when resuming from a saved sessionState (ACTION_REQUIRED
    // resume), since that state was already captured mid-application.
    if (!application.sessionState?.currentUrl) {
      const applyLink = page.locator(
        'a:has-text("Apply for this job"), a:has-text("Apply for this Job"), a:has-text("Apply now")'
      ).first();
      if (await applyLink.count() > 0) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {}),
          applyLink.click().catch(() => {}),
        ]);
        await page.waitForTimeout(1500);
      }
    }

    const answersByKey = new Map(application.answers.map(a => [a.fieldKey, a]));
    const fillResults = [];

    await fillAllFields(page, application.formInspection?.fields || [], answersByKey, fillResults);
    await advanceMultiStepForm(page, application, answersByKey, fillResults, extractFields);

    if (resumeVariant?.storageKey) {
      // Match the resume's own field, not just the first file input on the
      // page — see greenhouse.js's equivalent comment for why.
      const resumeField = (application.formInspection?.fields || [])
        .find(f => f.fieldType === 'file' && /resume|cv/i.test(`${f.key} ${f.label}`));
      const resumeInput = resumeField
        ? page.locator(`[name="${resumeField.key}"], #${resumeField.key}`).first()
        : page.locator('input[type="file"]').first();
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

    const submitButton = page.locator('button[type="submit"], button:has-text("Submit Application")').first();
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

module.exports = submitAshby;
