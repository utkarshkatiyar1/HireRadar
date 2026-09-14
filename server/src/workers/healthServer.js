const http = require('http');

// Render's free tier only supports "web" services (something must answer
// HTTP), not real background "worker" services (paid-plan only). These
// workers are conceptually background processes, but need a trivial HTTP
// listener to satisfy that requirement — this is that listener, nothing
// more. Pair with an UptimeRobot monitor per worker (same pattern as the
// existing API health check) so Render doesn't spin the service down after
// 15 minutes of no traffic.
function startHealthServer(name, port) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, worker: name }));
  });
  server.on('error', (err) => {
    // EADDRINUSE happens under worker-dev.js when both workers run in one
    // process and share a port — harmless, the first bind already answers
    // health checks for both.
    if (err.code === 'EADDRINUSE') {
      console.warn(`[${name}] health port already in use — skipping (fine under worker-dev.js)`);
    } else {
      throw err;
    }
  });
  server.listen(port, () => {
    console.log(`[${name}] health endpoint listening on :${port}`);
  });
  return server;
}

module.exports = { startHealthServer };
