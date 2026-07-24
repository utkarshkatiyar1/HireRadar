const IORedis = require('ioredis');

// Single shared ioredis connection, per BullMQ's recommended pattern
// (BullMQ requires maxRetriesPerRequest: null on the connection it manages).
let connection;

// ioredis's default retryStrategy retries reconnects forever with no cap.
// That's fine for transient network blips, but when Upstash's monthly
// command quota is exhausted, EVERY command (including reconnect handshakes)
// comes back as an error — not a dropped socket — so BullMQ's own internal
// maintenance calls (lock renewal, stalled-job checks, per-queue bclient/
// subscriber connections) keep re-attempting indefinitely, each attempt
// still metered by Upstash even when rejected. This is what turned one
// blown quota into a runaway climb instead of a clean stop. Capping retries
// here means a quota-exhaustion (or any prolonged outage) makes the
// connection give up after ~2 minutes instead of hammering forever.
const MAX_RETRY_ATTEMPTS = 20;
const retryStrategy = (times) => {
  if (times > MAX_RETRY_ATTEMPTS) return null; // null tells ioredis to stop retrying
  return Math.min(times * 500, 5000);
};

const getConnection = () => {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      retryStrategy,
    });
    connection.on('connect', () => console.log('[redis] connected'));
    connection.on('ready', () => console.log('[redis] ready'));
    connection.on('error', (err) => console.error('[redis] connection error:', err.message));
    connection.on('close', () => console.warn('[redis] connection closed'));
    connection.on('end', () => console.error('[redis] connection ended — retries exhausted, giving up'));
  }
  return connection;
};

module.exports = { getConnection };
