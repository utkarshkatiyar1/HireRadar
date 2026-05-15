const BUFFER_SIZE = 500;
const ADMIN_EMAIL = 'utkarshkatiyar688@gmail.com';

const buffer = [];
const clients = new Set();

const levels = { log: 'INFO', warn: 'WARN', error: 'ERROR' };

const push = (level, args) => {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '),
  };
  buffer.push(entry);
  if (buffer.length > BUFFER_SIZE) buffer.shift();
  for (const send of clients) send(entry);
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

module.exports = { subscribe, getBuffer, ADMIN_EMAIL };
