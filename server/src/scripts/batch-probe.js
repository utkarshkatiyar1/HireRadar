#!/usr/bin/env node
/**
 * Batch ATS probe — validates company candidates against all known ATS types.
 *
 * Usage:
 *   node batch-probe.js                        # probe all candidates
 *   node batch-probe.js --concurrency 12       # parallel limit (default: 8)
 *   node batch-probe.js --out found.json       # output file (default: found.json)
 *   node batch-probe.js --ats greenhouse       # only probe one ATS type
 *   node batch-probe.js --candidates file.json # custom candidates file
 *
 * Output: found.json — array of source configs ready for DB seeding.
 * Run seed after: node seed-found.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const axios   = require('axios');
const fs      = require('fs');
const path    = require('path');

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag, def = null) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const concurrency    = parseInt(getArg('--concurrency', '8'));
const outFile        = getArg('--out', path.join(__dirname, 'found.json'));
const onlyAts        = getArg('--ats', null);
const candidatesFile = getArg('--candidates', path.join(__dirname, 'candidates.json'));

if (!fs.existsSync(candidatesFile)) {
  console.error(`candidates file not found: ${candidatesFile}`);
  process.exit(1);
}

const candidates = JSON.parse(fs.readFileSync(candidatesFile, 'utf8'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const MIN_JOBS = 1;

// ─── Token variants ───────────────────────────────────────────────────────────
function tokenVariants(name, hints = []) {
  const base = name.toLowerCase();
  const variants = [
    ...hints,
    base.replace(/[^a-z0-9]/g, ''),
    base.replace(/\s+/g, '-'),
    base.replace(/\s+/g, '_'),
    base.replace(/\s+/g, ''),
    base.replace(/[^a-z0-9-]/g, ''),
  ];
  return [...new Set(variants)].filter(Boolean);
}

// ─── ATS validators ───────────────────────────────────────────────────────────
const VALIDATORS = {
  greenhouse: {
    async check(token) {
      const { data } = await axios.get(
        `https://boards-api.greenhouse.io/v1/boards/${token}/jobs`,
        { params: { content: false }, timeout: 8000, headers: { 'User-Agent': UA } }
      );
      if (!Array.isArray(data?.jobs)) return null;
      return {
        config: { ats: 'greenhouse', greenhouseToken: token, sourceType: 'ATS_STANDARD' },
        jobCount: data.jobs.length,
      };
    },
  },

  lever: {
    async check(token) {
      const { data } = await axios.get(
        `https://api.lever.co/v0/postings/${token}`,
        { params: { mode: 'json' }, timeout: 8000, headers: { 'User-Agent': UA } }
      );
      if (!Array.isArray(data)) return null;
      return {
        config: { ats: 'lever', leverToken: token, sourceType: 'ATS_STANDARD' },
        jobCount: data.length,
      };
    },
  },

  ashby: {
    async check(slug) {
      const { data } = await axios.get(
        `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
        { timeout: 8000, headers: { 'User-Agent': UA } }
      );
      const jobs = data?.jobs ?? data?.jobPostings ?? [];
      if (!Array.isArray(jobs)) return null;
      return {
        config: { ats: 'ashby', ashbySlug: slug, sourceType: 'ATS_STANDARD' },
        jobCount: jobs.length,
      };
    },
  },

  smartrecruiters: {
    async check(slug) {
      const { data } = await axios.get(
        `https://api.smartrecruiters.com/v1/companies/${slug}/postings`,
        { params: { limit: 100 }, timeout: 8000, headers: { 'User-Agent': UA } }
      );
      if (!Array.isArray(data?.content)) return null;
      return {
        config: { ats: 'smartrecruiters', smartrecruitersSlug: slug, sourceType: 'ATS_STANDARD' },
        jobCount: data.content.length,
      };
    },
  },

  sap: {
    // SAP SuccessFactors — tenant ID is often the company name (PascalCase or lowercase).
    // Tries both US and EU hosting regions.
    async check(token) {
      const HOSTS = [
        'career4.successfactors.com',
        'career5.successfactors.eu',
      ];
      for (const host of HOSTS) {
        try {
          const { data } = await axios.get(`https://${host}/career`, {
            params: { company: token, lang: 'en_US', format: 'json' },
            timeout: 8000,
            headers: { 'User-Agent': UA, Accept: 'application/json, text/html' },
          });
          // JSON response with jobs
          const items = data?.jobPostings ?? data?.results ?? data?.jobs ?? [];
          if (Array.isArray(items) && items.length > 0) {
            return {
              config: { ats: 'sap', sapTenant: token, sapHost: host, sourceType: 'ATS_STANDARD' },
              jobCount: items.length,
            };
          }
          // HTML response — check for SF fingerprint + job count hint
          if (typeof data === 'string' && data.includes('successfactors')) {
            const countMatch = data.match(/(\d+)\s+(?:job|position|opening)/i);
            const count = countMatch ? parseInt(countMatch[1]) : 1;
            if (count > 0 && data.includes(token)) {
              return {
                config: { ats: 'sap', sapTenant: token, sapHost: host, sourceType: 'ATS_STANDARD' },
                jobCount: count,
              };
            }
          }
        } catch { /* wrong tenant or host */ }
      }
      return null;
    },
  },

  eightfold: {
    // Eightfold locked their JSON API (returns 401/404). Detect by HTTP fingerprint:
    // valid tenants return 200 on /careers with eightfold-specific markup.
    async check(token) {
      const base = `https://${token}.eightfold.ai`;
      try {
        const { data, status } = await axios.get(`${base}/careers`, {
          timeout: 10000,
          headers: { 'User-Agent': UA },
          validateStatus: s => s < 500,
        });
        if (status !== 200) return null;
        if (typeof data !== 'string') return null;
        // Eightfold fingerprint: vscdn.net font + _csrf meta
        if (!data.includes('vscdn.net') || !data.includes('_csrf')) return null;
        return {
          config: { ats: 'eightfold', eightfoldBase: base, sourceType: 'ATS_STANDARD' },
          jobCount: 1, // can't count without Playwright at probe time
        };
      } catch { return null; }
    },
  },

  workday: {
    // Workday needs 3 things: base URL (includes wd number), tenant slug, site name.
    // Strategy: try most common wd numbers × common site names, bail on first hit.
    async check(token) {
      const WD_NUMS  = ['wd5', 'wd3', 'wd1', 'wd12', 'wd2'];
      const SITES    = [
        'careers', 'Careers', 'External', 'external', 'Jobs', 'jobs',
        `${token}careers`, `${token}Careers`,
        'External_Career_Site', 'Experienced_Professionals',
      ];

      for (const wdn of WD_NUMS) {
        const base = `https://${token}.${wdn}.myworkdayjobs.com`;

        // Any HTTP response (even 4xx/5xx) = domain exists.
        // Only a network/DNS error means this wd number has no tenant.
        try {
          await axios.head(base, {
            timeout: 5000,
            headers: { 'User-Agent': UA },
            maxRedirects: 5,
            validateStatus: () => true,
          });
        } catch { continue; }

        for (const site of SITES) {
          try {
            const { data } = await axios.post(
              `${base}/wday/cxs/${token}/${site}/jobs`,
              { appliedFacets: {}, limit: 1, offset: 0, searchText: '' },
              {
                timeout: 6000,
                headers: {
                  'Content-Type': 'application/json',
                  'User-Agent': UA,
                  Accept: 'application/json',
                },
              }
            );
            if (typeof data?.total === 'number' && data.total >= MIN_JOBS) {
              return {
                config: {
                  ats: 'workday',
                  workdayBase: base,
                  workdayTenant: token,
                  workdaySite: site,
                  sourceType: 'ATS_WORKDAY',
                },
                jobCount: data.total,
              };
            }
          } catch {}
        }
      }
      return null;
    },
  },
};

const ATS_NAMES = onlyAts ? [onlyAts] : Object.keys(VALIDATORS);

// ─── Probe single candidate ───────────────────────────────────────────────────
async function probeOne({ company, tokens: hints = [] }) {
  const variants = tokenVariants(company, hints);

  for (const atsName of ATS_NAMES) {
    const validator = VALIDATORS[atsName];
    if (!validator) continue;

    // Workday: only try the first 3 token variants (tenant guessing has diminishing returns)
    const tokensToTry = atsName === 'workday' ? variants.slice(0, 3) : variants;

    for (const token of tokensToTry) {
      try {
        const hit = await validator.check(token);
        if (!hit) continue;
        if (hit.jobCount < MIN_JOBS) return null;
        return { company, ...hit.config, lastJobCount: hit.jobCount };
      } catch {
        // expected — wrong token or wrong ATS
      }
    }
  }
  return null;
}

// ─── Concurrency pool ─────────────────────────────────────────────────────────
async function runPool(tasks, limit) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Skip companies already in DB (not just static sources.js)
  let existing = new Set();
  try {
    const { connect, Source } = require('../utils/db');
    await connect();
    const docs = await Source.find({}, { company: 1, _id: 0 }).lean();
    existing = new Set(docs.map(d => d.company.toLowerCase()));
    console.log(`  (${existing.size} companies already in DB — skipping)`);
  } catch (e) {
    // DB unavailable — fall back to static sources
    existing = new Set(require('../config/sources').map(s => s.company.toLowerCase()));
    console.warn('  Warning: DB unavailable, falling back to static sources for skip check');
  }

  const todo = candidates.filter(c => !existing.has(c.company.toLowerCase()));
  const skip = candidates.length - todo.length;

  console.log(`\nBatch probe: ${todo.length} candidates  (${skip} already known, skipped)`);
  console.log(`ATS targets: ${ATS_NAMES.join(', ')}`);
  console.log(`Concurrency: ${concurrency}\n`);

  let done = 0;
  const tasks = todo.map(candidate => async () => {
    const result = await probeOne(candidate);
    done++;
    const pct = ((done / todo.length) * 100).toFixed(0);
    if (result) {
      console.log(`  [${pct}%] ✓  ${result.company.padEnd(28)} ${result.ats.padEnd(16)} ${result.lastJobCount} jobs`);
    } else {
      process.stdout.write(`  [${pct}%] -  ${candidate.company}\r`);
    }
    return result;
  });

  const results = await runPool(tasks, concurrency);
  const found   = results.filter(Boolean);

  console.log(`\n\nFound: ${found.length} / ${todo.length}`);
  fs.writeFileSync(outFile, JSON.stringify(found, null, 2));
  console.log(`Saved → ${outFile}`);
  console.log('\nNext: node seed-found.js\n');
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
