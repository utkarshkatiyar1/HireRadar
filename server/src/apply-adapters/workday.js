const { chromium } = require('playwright');
const {
  takeScreenshot, shouldSkipSubmission, markSubmitAttempted, detectConfirmation,
  saveSessionState, loadSessionStatePath, clearSessionState, findUnfilledRequiredFields,
  fillAllFields, advanceMultiStepForm,
} = require('./shared');
const { detectCaptcha } = require('../form-inspector/inspect');
const { extractFields } = require('../form-inspector/extractFields');
const { stealthContextOptions, LAUNCH_ARGS, applyStealth } = require('./stealth');

// Workday adapter — NOT confirmed via the same live-inspection process that
// greenhouse.js/lever.js/ashby.js went through (those three each have a
// documented real incident that shaped their navigation logic). Built from
// Workday's well-documented public structure instead: myworkdayjobs.com
// postings almost always require an account (email verification or a
// "Sign In"/"Create Account" gate) before the actual application wizard is
// reachable, and the wizard itself is a genuinely multi-step flow (My
// Information -> My Experience -> Application Questions -> Voluntary
// Disclosures -> Review), unlike Greenhouse/Lever/Ashby's single-page forms.
// Treat this adapter as higher-risk / needs-real-world-validation than the
// other three — the login-wall detection below is deliberately conservative
// (routes to ACTION_REQUIRED rather than guessing) precisely because this
// hasn't been confirmed against a real Workday tenant yet.
async function submitWorkday({ application, job, resumeVariant }) {
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
    await page.waitForTimeout(1500);

    // Workday almost universally requires "Apply" -> "Autofill with Resume"
    // or a manual account before the real form appears — this click reveals
    // the application entry point on the job detail page.
    const applyButton = page.locator('button:has-text("Apply"), a:has-text("Apply")').first();
    if (!application.sessionState?.currentUrl && await applyButton.count() > 0) {
      await applyButton.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
        applyButton.click().catch(() => {}),
      ]);
      await page.waitForTimeout(1500);
    }

    // Confirmed via live testing: "Apply" opens a "Start Your Application"
    // modal (Autofill with Resume / Apply Manually / Use My Last Application)
    // rather than the wizard directly — without this click the adapter never
    // reached the real form OR the account gate below, and silently found
    // nothing to fill. "Apply Manually" is the only option that puts real
    // candidate-supplied values into named fields under our own control
    // rather than handing the resume to Workday's own parsing/autofill.
    const applyManuallyLink = page.locator('a:has-text("Apply Manually"), button:has-text("Apply Manually")').first();
    if (!application.sessionState?.currentUrl && await applyManuallyLink.count() > 0) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
        applyManuallyLink.click().catch(() => {}),
      ]);
      await page.waitForTimeout(4000);
    }

    // Workday's account gate is a real, hard blocker — it is NOT a login
    // wall in the same sense as a company-internal tool (this is Workday's
    // OWN account system, required before the wizard is reachable at all,
    // distinct from detectLoginWall's job-board-login check in
    // form-inspector/inspect.js). Detected here via Workday's own
    // "Sign In"/"Create Account" page markers rather than assuming
    // formInspection.requiresLogin already caught it, since that check runs
    // at inspect time and this page may have changed since.
    //
    // NOT gated on a password field being present too — confirmed via live
    // testing that step 1 of Workday's wizard ("Create Account/Sign In") only
    // shows a Sign-In/Create-Account CHOICE, no password field renders until
    // one of those is picked. Requiring a password field here meant this
    // check silently failed to fire on that exact step, so ACTION_REQUIRED
    // never triggered and the adapter fell through into the "not automatable"
    // path with zero explanation of why.
    const accountGateText = await page.locator('body').innerText().catch(() => '');
    const needsAccount = /create account|sign in to workday|already have an account|create account\/sign in/i.test(accountGateText);
    if (needsAccount) {
      await saveSessionState(ctx, application._id.toString());
      return {
        outcome: 'ACTION_REQUIRED',
        pendingQuestion: { question: 'This Workday posting requires signing in or creating a Workday account before applying — do this manually, then continue.', fieldKey: 'login' },
        screenshotRef: await takeScreenshot(page, { applicationId: application._id, label: 'pre-submit' }),
        fillResults: [],
      };
    }

    const answersByKey = new Map(application.answers.map(a => [a.fieldKey, a]));
    const fillResults = [];

    await fillAllFields(page, application.formInspection?.fields || [], answersByKey, fillResults);
    // Workday's wizard is multi-step by default (unlike Greenhouse/Lever/
    // Ashby, where multi-step is the exception) — this is the adapter this
    // logic matters most for.
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

    // Workday's final-step button is usually "Submit" specifically (its
    // "Next"/"Continue" buttons on earlier steps are already consumed by
    // advanceMultiStepForm above, which only advances — this locator
    // intentionally excludes those to avoid re-triggering a step-advance
    // here instead of the real, final submit).
    const submitButton = page.locator('button:has-text("Submit"), button[type="submit"]').first();
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

module.exports = submitWorkday;
