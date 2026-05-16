require('dotenv').config();
require('./utils/logger'); // patch console first
const express = require('express');
const cors    = require('cors');
const cron    = require('node-cron');
const { connect } = require('./utils/db');
const jobsRouter    = require('./routes/jobs');
const authRouter    = require('./routes/auth');
const adminRouter   = require('./routes/admin');
const profileRouter = require('./routes/profile');
const scrape      = require('./index');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/auth', authRouter);
app.use('/jobs', jobsRouter);
app.use('/admin', adminRouter);
app.use('/profile', profileRouter);

// Health check — UptimeRobot pings this to keep Render awake
app.get('/health', (_req, res) => res.json({ ok: true }));

(async () => {
  await connect();
  console.log('MongoDB connected');
  app.listen(PORT, () => console.log(`API  → http://localhost:${PORT}/jobs`));

  cron.schedule('0 */2 * * *', async () => {
    console.log(`[CRON] ${new Date().toISOString()} — starting scrape`);
    await scrape();
  });

  console.log('Cron scheduled — every 2 hours');
})();
