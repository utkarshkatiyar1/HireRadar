const BUFFER_SIZE = 500;
const ADMIN_EMAIL = 'utkarshkatiyar688@gmail.com';
const LOG_CHANNEL = 'hireradar:logs';
// SERVICE_NAME lets multi-service log entries (this process's own, plus any
// relayed over Redis pub/sub from the worker services) be told apart in the
// admin Terminal UI. Render sets RENDER_SERVICE_NAME per service in production.
const SERVICE_NAME = process.env.RENDER_SERVICE_NAME || process.env.SERVICE_NAME || 'api';

const buffer = [];
const clients = new Set();

const push = (level, args, service = SERVICE_NAME) => {
  const entry = {
    ts: new Date().toISOString(),
    level,
    service,
    msg: args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '),
  };
  buffer.push(entry);
  if (buffer.length > BUFFER_SIZE) buffer.shift();
  for (const send of clients) send(entry);
  return entry;
};

// Publisher — every process (API + both workers) publishes its own log
// entries here so the API process (the only one with the SSE /admin/logs
// route) can relay entries from the worker services too. Lazily requires
// ioredis so environments without REDIS_URL configured (e.g. tests) don't
// need a live connection just to log.
let publisher = null;
const getPublisher = () => {
  if (publisher === null) {
    try {
      const IORedis = require('ioredis');
      publisher = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: null,
        lazyConnect: true,
      });
      publisher.connect().catch(() => {}); // errors surface via 'error' below, never crash logging
      publisher.on('error', () => {}); // swallow — logging must never throw
    } catch {
      publisher = false; // ioredis unavailable — logging stays local-only
    }
  }
  return publisher || null;
};

const publish = (entry) => {
  const conn = getPublisher();
  if (!conn) return;
  conn.publish(LOG_CHANNEL, JSON.stringify(entry)).catch(() => {});
};

// Patch console methods
const origLog   = console.log.bind(console);
const origWarn  = console.warn.bind(console);
const origError = console.error.bind(console);

console.log   = (...a) => { origLog(...a);   publish(push('INFO',  a)); };
console.warn  = (...a) => { origWarn(...a);  publish(push('WARN',  a)); };
console.error = (...a) => { origError(...a); publish(push('ERROR', a)); };

// Subscriber — only meaningful in the API process, which owns the SSE route.
// A dedicated connection is required: once a Redis connection issues
// SUBSCRIBE it can only be used for pub/sub commands, so it must never be
// the same connection BullMQ or the publisher above uses for other commands.
let subscriberStarted = false;
const startRemoteLogRelay = () => {
  if (subscriberStarted) return;
  subscriberStarted = true;
  try {
    const IORedis = require('ioredis');
    const sub = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
    sub.on('error', (err) => origError('[logger] relay subscriber error:', err.message));
    sub.subscribe(LOG_CHANNEL).catch((err) => origError('[logger] relay subscribe failed:', err.message));
    sub.on('message', (_channel, raw) => {
      let entry;
      try { entry = JSON.parse(raw); } catch { return; }
      if (entry.service === SERVICE_NAME) return; // already pushed locally by push() above
      buffer.push(entry);
      if (buffer.length > BUFFER_SIZE) buffer.shift();
      for (const send of clients) send(entry);
    });
  } catch (err) {
    origError('[logger] failed to start remote log relay:', err.message);
  }
};

const subscribe = (send) => {
  clients.add(send);
  return () => clients.delete(send);
};

const getBuffer = () => [...buffer];

const clearBuffer = () => { buffer.length = 0; };

module.exports = { subscribe, getBuffer, clearBuffer, ADMIN_EMAIL, startRemoteLogRelay };
