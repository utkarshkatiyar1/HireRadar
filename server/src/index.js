require('dotenv').config();
const { connect, Job, Source } = require('./utils/db');
const { scrapeFilter } = require('./utils/filter');
const { DEFAULTS } = require('./config/sources');

const loadScraper = (src) => {
  if (src.ats === 'custom-api' || src.ats === 'playwright') {
    return require(`./scrapers/custom/${src.scraperModule}`);
  }
  return require(`./scrapers/ats/${src.ats}`);
};

const AUTO_DISABLE_AFTER = 3; // consecutive zero-yield scrapes before disabling

const updateSourceHealth = async (company, { jobCount, failed }) => {
  if (!company) return;
  try {
    if (failed) {
      await Source.findOneAndUpdate(
        { company },
        {
          $inc: { consecutiveFailures: 1 },
          $set: { lastScrapedAt: new Date() },
        }
      ).then(async (doc) => {
        if (doc && doc.consecutiveFailures + 1 >= AUTO_DISABLE_AFTER) {
          await Source.updateOne({ company }, { $set: { enabled: false } });
          console.warn(`[${company}] auto-disabled after ${AUTO_DISABLE_AFTER} consecutive failures`);
        }
      });
    } else {
      await Source.updateOne(
        { company },
        {
          $set: { lastJobCount: jobCount, lastScrapedAt: new Date(), consecutiveFailures: 0 },
        }
      );
    }
  } catch {
    // health update failure should never abort a scrape
  }
};

const scrapeOne = async (src) => {
  const scraper = loadScraper(src);
  let raw, matched;

  try {
    raw     = await scraper(src);
    matched = scrapeFilter(raw);
  } catch (e) {
    await updateSourceHealth(src.company, { failed: true });
    throw e;
  }

  const now = new Date();

  if (!matched.length) {
    console.log(`[${src.company}] raw=${raw.length} matched=0 saved=0 dupes=0`);
    await updateSourceHealth(src.company, { jobCount: 0, failed: false });
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
  await updateSourceHealth(src.company, { jobCount: matched.length, failed: false });
};

// Run up to `limit` scrapers in parallel, then next batch
const loadSources = async () => {
  const docs = await Source.find({ enabled: true }).lean();
  // Apply DEFAULTS (DB overrides win, same logic as static sources.js)
  return docs.map(s => ({ ...DEFAULTS, ...s }));
};

const scrapeInBatches = async (limit = 8) => {
  const sources = await loadSources();
  console.log(`[scrape] ${sources.length} sources loaded from DB`);
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
