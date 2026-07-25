const BUFFER_SIZE = 500;
const ADMIN_EMAIL = 'utkarshkatiyar688@gmail.com';

// Local-only in-memory log buffer + SSE fan-out. Used to relay logs from the
// pipeline-worker/apply-worker over Redis pub/sub back when they ran as
// separate Render services — that's no longer needed since all three now
// run in this one process (see cron.js), so their console.log calls already
// land in this same buffer directly. The Redis relay was removed after it
// caused two separate incidents: an unbounded reconnect loop during a Redis
// outage, and then (even after capping reconnect retries) a feedback loop
// where a failed PUBLISH got logged via the patched console.error, which
// tried to PUBLISH that error, which failed and got logged again — climbing
// unboundedly until the metered command quota was exhausted. Keeping this
// local-only removes that entire class of risk.
const buffer = [];
const clients = new Set();

const push = (level, args) => {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '),
  };
  buffer.push(entry);
  if (buffer.length > BUFFER_SIZE) buffer.shift();
  for (const send of clients) send(entry);
  return entry;
};

// Patch console methods
const origLog   = console.log.bind(console);
const origWarn  = console.warn.bind(console);
const origError = console.error.bind(console);

console.log   = (...a) => { origLog(...a);   push('INFO',  a); };
console.warn  = (...a) => { origWarn(...a);  push('WARN',  a); };
console.error = (...a) => { origError(...a); push('ERROR', a); };

const subscribe = (send) => {
  clients.add(send);
  return () => clients.delete(send);
};

const getBuffer = () => [...buffer];

const clearBuffer = () => { buffer.length = 0; };

module.exports = { subscribe, getBuffer, clearBuffer, ADMIN_EMAIL };
