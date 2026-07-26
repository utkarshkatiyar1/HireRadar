const { chromium } = require('playwright');
const {
  takeScreenshot, fillField, shouldSkipSubmission, detectConfirmation,
  saveSessionState, loadSessionStatePath, clearSessionState,
} = require('./shared');
const { detectCaptcha } = require('../form-inspector/inspect');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0 Safari/537.36';

// Ashby adapter — same flow as greenhouse.js/lever.js. Ashby job boards are
// React SPAs, so the application form is often already present on the job
// page rather than behind a separate "Apply" click.
async function submitAshby({ application, job, resumeVariant }) {
  const dryRun = process.env.APPLY_DRY_RUN !== 'false';
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
    // domcontentloaded, not networkidle — many real job-board pages never
    // reach true network idle (persistent analytics/polling), which turned
    // a fully-loaded, usable page into a hard 30s timeout failure.
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // SPA hydration — give the form time to render before locating fields.
    await page.waitForTimeout(1500);

    const answersByKey = new Map(application.answers.map(a => [a.fieldKey, a]));
    const fillResults = [];

    for (const field of application.formInspection?.fields || []) {
      const answer = answersByKey.get(field.key);
      if (!answer || answer.value == null) continue;
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

    if (dryRun) {
      clearSessionState(application._id.toString());
      return { outcome: 'DRY_RUN_COMPLETED', screenshotRef: preSubmitScreenshotRef, fillResults };
    }

    const submitButton = page.locator('button[type="submit"], button:has-text("Submit Application")').first();
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
