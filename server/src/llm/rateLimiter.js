// Simple per-key pacing — serializes calls sharing a key so consecutive
// calls are spaced at least `minIntervalMs` apart. One process (this API
// service, the pipeline-worker, the apply-worker) each get their own
// in-memory queue; it does not coordinate across OS processes, so it's a
// best-effort throttle, not a hard global guarantee — providers.voyage.js's
// retry-with-backoff on real 429s is the backstop for whatever this misses.
const queues = new Map(); // key -> Promise (tail of the queue for that key)

function throttle(key, minIntervalMs) {
  if (!minIntervalMs || minIntervalMs <= 0) return Promise.resolve();

  const now = Date.now();
  const prevTail = queues.get(key) || Promise.resolve(now - minIntervalMs);

  const tail = prevTail.then(async (prevAt) => {
    const wait = prevAt + minIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return Date.now();
  });

  queues.set(key, tail);
  return tail;
}

module.exports = { throttle };
