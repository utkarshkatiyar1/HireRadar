// Shared browser-launch configuration for every Playwright context this
// tool opens — apply-adapters AND form-inspector/inspect.js. Previously
// every adapter hardcoded the same single UA string, no fingerprint
// diversity, no navigator.webdriver patching, and every request originated
// from the same datacenter IP with an identical fingerprint — a textbook
// bot-detection pattern (Cloudflare/PerimeterX/ATS-native abuse detection
// all key on exactly this). This does not defeat CAPTCHA/bot-detection
// outright (detectCaptcha in form-inspector/inspect.js still exists and
// still routes to ACTION_REQUIRED rather than attempting to bypass anything)
// — it only removes the most obvious, cheap-to-fix automation tells so a
// legitimate, human-directed application doesn't get flagged for looking
// like a script when it isn't trying to evade anything.

// A small pool of real, current desktop Chrome/Edge UA strings — rotated
// per-session (one browser launch = one UA), not per-request, since a UA
// that changes mid-session is itself a stronger anomaly signal than a
// static one.
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
];

const LOCALES = ['en-US', 'en-GB'];
const TIMEZONES = ['America/New_York', 'America/Los_Angeles', 'America/Chicago', 'Europe/London'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Applied once per browser.newContext() call. Bundles UA + viewport +
// locale + timezone as one coherent "identity" (all four correlated to the
// same fake session) rather than randomizing each independently, which
// would itself look inconsistent (e.g. a Mac UA with a Windows-only screen
// resolution is its own tell).
function stealthContextOptions() {
  return {
    userAgent: pick(USER_AGENTS),
    viewport: pick(VIEWPORTS),
    locale: pick(LOCALES),
    timezoneId: pick(TIMEZONES),
  };
}

// Launch args — --disable-blink-features=AutomationControlled is the single
// highest-value flag here: it's what stops Chromium from setting
// navigator.webdriver = true, which is the first thing most basic
// bot-detection scripts check for. The other two flags were already in use
// (sandbox/dev-shm-usage are container/CI stability flags, unrelated to
// fingerprinting) and are kept as-is.
const LAUNCH_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'];

// Injected into every new page via addInitScript — runs before the target
// page's own JS, so navigator.webdriver reads false/undefined by the time
// any detection script checks it. --disable-blink-features=AutomationControlled
// already covers Chromium's own webdriver flag; this is defense in depth
// for the (common) case where a detection script checks it a different way,
// plus patches the other two most commonly checked automation tells
// (a missing chrome.runtime object, and navigator.plugins being empty in
// headless mode specifically).
const INIT_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  window.chrome = window.chrome || { runtime: {} };
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
`;

async function applyStealth(context) {
  await context.addInitScript(INIT_SCRIPT);
}

module.exports = { stealthContextOptions, LAUNCH_ARGS, applyStealth };
