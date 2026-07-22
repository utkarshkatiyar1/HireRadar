const crypto = require('crypto');

const SECRET = process.env.SCREENSHOT_SIGNING_SECRET || 'dev-only-change-me';
if (!process.env.SCREENSHOT_SIGNING_SECRET) {
  console.warn('[screenshots] SCREENSHOT_SIGNING_SECRET not set — using insecure dev fallback');
}

const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes — short-lived, re-requested via /audit on each view

// Signs {filename, userId, expiresAt} so a screenshot can be served without
// a permanent public path. Binding the signature to userId (not just
// filename) prevents one user from viewing another user's screenshot even
// if they guessed/observed the filename before it expired — filenames are
// applicationId-prefixed (see apply-adapters/shared.js's takeScreenshot) but
// not secret. Screenshots may contain phone/address/salary/email details
// (see apply-adapters/shared.js's blankSensitiveFields), so they are never
// express.static-served — only reachable via this signed-URL scheme.
function signScreenshot(filename, userId, ttlMs = DEFAULT_TTL_MS) {
  const expiresAt = Date.now() + ttlMs;
  const payload = `${filename}.${userId}.${expiresAt}`;
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  return { expiresAt, sig };
}

function verifyScreenshotSignature(filename, userId, expiresAt, sig) {
  if (Date.now() > Number(expiresAt)) return false;
  const payload = `${filename}.${userId}.${expiresAt}`;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  // Constant-time comparison — avoid leaking signature validity via timing.
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Builds the full signed path the frontend can fetch directly (with auth
// header) — GET /applications/screenshots/:filename?expires=...&sig=...
function buildSignedScreenshotUrl(filename, userId) {
  if (!filename) return null;
  const { expiresAt, sig } = signScreenshot(filename, userId);
  return `/applications/screenshots/${encodeURIComponent(filename)}?expires=${expiresAt}&sig=${sig}`;
}

module.exports = { signScreenshot, verifyScreenshotSignature, buildSignedScreenshotUrl };
