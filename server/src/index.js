require('dotenv').config();
const { connect, Job } = require('./utils/db');
const { scrapeFilter } = require('./utils/filter');
const sources = require('./config/sources');

const loadScraper = (src) => {
  if (src.ats === 'custom-api' || src.ats === 'playwright') {
    return require(`./scrapers/custom/${src.scraperModule}`);
  }
  return require(`./scrapers/ats/${src.ats}`);
};

const scrapeOne = async (src) => {
  const scraper = loadScraper(src);
  const raw     = await scraper(src);
  const matched = scrapeFilter(raw);
  const now     = new Date();

  if (!matched.length) {
    console.log(`[${src.company}] raw=0 matched=0 saved=0 dupes=0`);
    return;
  }

  const ops = matched.map(j => ({
    updateOne: {
      filter: { url: j.url },
      update: {
        $setOnInsert: { ...j, ats: src.ats, atsSearched: false, firstSeen: now },
        $set:         { lastSeen: now },
      },
      upsert: true,
    },
  }));

  const result = await Job.bulkWrite(ops, { ordered: false });
  const saved  = result.upsertedCount ?? 0;
  const dupes  = matched.length - saved;
  console.log(`[${src.company}] raw=${raw.length} matched=${matched.length} saved=${saved} dupes=${dupes}`);
};

// Run up to `limit` scrapers in parallel, then next batch
const scrapeInBatches = async (limit = 8) => {
  for (let i = 0; i < sources.length; i += limit) {
    const batch = sources.slice(i, i + limit);
    await Promise.allSettled(
      batch.map(src =>
        scrapeOne(src).catch(e => console.error(`[${src.company}] error:`, e.message))
      )
    );
  }
};

const scrape = async () => {
  console.log(`[${new Date().toISOString()}] scrape start`);
  await scrapeInBatches(8);
  console.log(`[${new Date().toISOString()}] scrape done`);
};

module.exports = scrape;

if (require.main === module) {
  (async () => {
    await connect();
    await scrape();
    process.exit(0);
  })();
}
