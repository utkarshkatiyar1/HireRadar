const { chromium } = require('playwright');
const {
  takeScreenshot, shouldSkipSubmission, markSubmitAttempted, detectConfirmation,
  saveSessionState, loadSessionStatePath, clearSessionState, findUnfilledRequiredFields,
  fillAllFields, advanceMultiStepForm,
} = require('./shared');
const { detectCaptcha } = require('../form-inspector/inspect');
const { extractFields } = require('../form-inspector/extractFields');
const { stealthContextOptions, LAUNCH_ARGS, applyStealth } = require('./stealth');

// Eightfold adapter — NOT confirmed via live inspection the way
// greenhouse.js/lever.js/ashby.js were (see workday.js's equivalent
// disclaimer). Eightfold-hosted career sites are React SPAs (similar
// structural risk to Ashby's — forms not necessarily wrapped in a <form>
// element, which form-inspector/extractFields.js already handles generically)
// and commonly offer a resume-upload-first flow that auto-populates the rest
// of the form via parsing — this adapter still goes through the normal
// fill-from-drafted-answers path rather than relying on Eightfold's own
// resume parser, since the drafted answers are already grounded/verified and
// re-parsing the resume server-side would bypass that verification entirely.
async function submitEightfold({ application, job, resumeVariant }) {
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
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // SPA hydration — same reasoning as ashby.js's equivalent wait.
    await page.waitForTimeout(1500);

    if (!application.sessionState?.currentUrl) {
      const applyLink = page.locator(
        'a:has-text("Apply"), button:has-text("Apply"), a:has-text("Apply Now"), button:has-text("Apply Now")'
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
      const resumeField = (application.formInspection?.fields || [])
        .find(f => f.fieldType === 'file' && /resume|cv/i.test(`${f.key} ${f.label}`));
      const resumeInput = resumeField
        ? page.locator(`[name="${resumeField.key}"], #${resumeField.key}`).first()
        : page.locator('input[type="file"]').first();
      if (await resumeInput.count() > 0) {
        const resumePath = require('path').join(__dirname, '..', '..', 'uploads', 'resumes', resumeVariant.storageKey);
        await resumeInput.setInputFiles(resumePath, { force: true }).then(() => {
          fillResults.push({ fieldKey: 'resume', filled: true });
        }).catch(() => {
          fillResults.push({ fieldKey: 'resume', filled: false, reason: 'file input not accessible' });
        });
      }
    }

    const preSubmitUrl = page.url();
    const preSubmitScreenshotRef = await takeScreenshot(page, { applicationId: application._id, label: 'pre-submit' });

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

    const submitButton = page.locator('button[type="submit"], button:has-text("Submit Application"), button:has-text("Submit")').first();
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

module.exports = submitEightfold;
