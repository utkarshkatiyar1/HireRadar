require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const cron    = require('node-cron');
const { connect } = require('./utils/db');
const jobsRouter  = require('./routes/jobs');
const scrape      = require('./index');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/jobs', jobsRouter);

(async () => {
  await connect();
  console.log('MongoDB connected');

  app.listen(PORT, () => console.log(`API  → http://localhost:${PORT}/jobs`));

  await scrape();

  cron.schedule('0 */2 * * *', async () => {
    console.log(`[CRON] ${new Date().toISOString()}`);
    await scrape();
  });

  console.log('Cron scheduled — every 2 hours');
})();
