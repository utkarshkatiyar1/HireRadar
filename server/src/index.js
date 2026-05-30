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

const AUTO_DISABLE_AFTER = 3;

const updateSourceHealth = async (company, { jobCount, failed }) => {
  if (!company) return;
  try {
    if (failed) {
      await Source.findOneAndUpdate(
        { company },
        { $inc: { consecutiveFailures: 1 }, $set: { lastScrapedAt: new Date() } }
      ).then(async (doc) => {
        if (doc && doc.consecutiveFailures + 1 >= AUTO_DISABLE_AFTER) {
          await Source.updateOne({ company }, { $set: { enabled: false } });
          console.warn(`[${company}] auto-disabled after ${AUTO_DISABLE_AFTER} consecutive failures`);
        }
      });
    } else {
      await Source.updateOne(
        { company },
        { $set: { lastJobCount: jobCount, lastScrapedAt: new Date(), consecutiveFailures: 0 } }
      );
    }
  } catch { /* health update failure should never abort a scrape */ }
};

// ─── Scrape a single source ───────────────────────────────────────────────────
const scrapeOne = async (src) => {
  const scraper = loadScraper(src);
  let raw, matched;

  try {
    raw     = await scraper(src);
    matched = scrapeFilter(raw);
  } catch (e) {
    await updateSourceHealth(src.company, { failed: true });
    return { company: src.company, ats: src.ats, saved: 0, matched: 0, failed: true, error: e.message };
  }

  if (!matched.length) {
    await updateSourceHealth(src.company, { jobCount: 0, failed: false });
    return { company: src.company, ats: src.ats, saved: 0, matched: 0, failed: false };
  }

  const now = new Date();
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
  await updateSourceHealth(src.company, { jobCount: matched.length, failed: false });
  return { company: src.company, ats: src.ats, saved, matched: matched.length, failed: false };
};

// ─── Terminal progress reporter ───────────────────────────────────────────────
class ScrapeReporter {
  constructor(total) {
    this.total    = total;
    this.done     = 0;
    this.newJobs  = 0;
    this.failed   = 0;
    this.top      = []; // { company, count }
    this.start    = Date.now();
    this.isTTY    = process.stdout.isTTY;
    this._barUp   = false;
  }

  tick({ company, ats, saved = 0, failed = false }) {
    this.done++;
    if (failed) {
      this.failed++;
      this._line(`\x1b[31m✗\x1b[0m ${company.padEnd(30)} ${(ats || '').padEnd(16)} failed`);
    } else if (saved > 0) {
      this.newJobs += saved;
      this.top.push({ company, count: saved });
      this._line(`\x1b[32m✓\x1b[0m ${company.padEnd(30)} ${(ats || '').padEnd(16)} \x1b[32m+${saved}\x1b[0m new`);
    }
    this._bar();
  }

  // Print a content line above the bar
  _line(text) {
    if (this.isTTY && this._barUp) process.stdout.write('\r\x1b[K'); // clear bar
    console.log('  ' + text);
  }

  _hms(ms) {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  _bar() {
    const pct     = this.done / this.total;
    const elapsed = Date.now() - this.start;
    const eta     = this.done > 0 ? (elapsed / this.done) * (this.total - this.done) : 0;
    const filled  = Math.round(pct * 28);
    const bar     = `\x1b[32m${'█'.repeat(filled)}\x1b[90m${'░'.repeat(28 - filled)}\x1b[0m`;
    const pctStr  = `${(pct * 100).toFixed(0).padStart(3)}%`;
    const line    = `  [${bar}] ${pctStr}  \x1b[2m${this.done}/${this.total}\x1b[0m  \x1b[33m+${this.newJobs} new\x1b[0m  \x1b[31m✗${this.failed}\x1b[0m  ⏱ ${this._hms(elapsed)}  ETA ${this._hms(eta)}`;

    if (this.isTTY) {
      process.stdout.write(`\r\x1b[K${line}`);
      this._barUp = true;
    } else if (this.done % 25 === 0 || this.done === this.total) {
      console.log(`[scrape] ${(pct * 100).toFixed(0)}% (${this.done}/${this.total}) +${this.newJobs} new  ✗${this.failed}  ${this._hms(elapsed)}`);
    }
  }

  summary() {
    if (this.isTTY) process.stdout.write('\r\x1b[K');

    const elapsed = this._hms(Date.now() - this.start);
    const top5 = this.top
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(s => `${s.company} \x1b[32m+${s.count}\x1b[0m`)
      .join('  ·  ');

    const W = 64;
    const row = (txt) => {
      const clean = txt.replace(/\x1b\[[0-9;]*m/g, '');
      const pad   = Math.max(0, W - clean.length);
      return `  \x1b[1m║\x1b[0m  ${txt}${' '.repeat(pad)}\x1b[1m║\x1b[0m`;
    };

    console.log();
    console.log(`  \x1b[1m╔${'═'.repeat(W + 2)}╗\x1b[0m`);
    console.log(row(`\x1b[32m\x1b[1m✓ Scrape complete\x1b[0m   ${this.done - this.failed}/${this.total} sources   ⏱ ${elapsed}`));
    console.log(row(`\x1b[1m+${this.newJobs} new jobs\x1b[0m   \x1b[31m✗ ${this.failed} failed\x1b[0m`));
    if (top5) console.log(row(`Top: ${top5}`));
    console.log(`  \x1b[1m╚${'═'.repeat(W + 2)}╝\x1b[0m`);
    console.log();
  }
}

// ─── Source loader ────────────────────────────────────────────────────────────
const loadSources = async () => {
  const docs = await Source.find({ enabled: true }).lean();
  return docs.map(s => ({ ...DEFAULTS, ...s }));
};

// ─── Main scrape loop ─────────────────────────────────────────────────────────
const scrapeInBatches = async (limit = 20) => {
  const sources  = await loadSources();
  const reporter = new ScrapeReporter(sources.length);

  console.log(`\n  [scrape] ${sources.length} sources loaded from DB\n`);

  for (let i = 0; i < sources.length; i += limit) {
    const batch = sources.slice(i, i + limit);
    // Each source ticks the reporter as soon as it finishes — real-time updates
    await Promise.allSettled(
      batch.map(src =>
        scrapeOne(src)
          .then(r  => reporter.tick(r))
          .catch(() => reporter.tick({ company: src.company, ats: src.ats, saved: 0, failed: true }))
      )
    );
  }

  reporter.summary();
};

const scrape = async () => {
  const ts = new Date().toISOString();
  console.log(`\n  ┄┄ scrape triggered ${ts}`);
  await scrapeInBatches(20);
};

module.exports = scrape;

if (require.main === module) {
  (async () => {
    await connect();
    await scrape();
    process.exit(0);
  })();
}
