#!/usr/bin/env node
/**
 * Batch ATS probe — validates a list of company candidates against all known
 * ATS types and outputs a DB seed file of confirmed sources.
 *
 * Usage:
 *   node batch-probe.js                        # probe all candidates
 *   node batch-probe.js --concurrency 10       # parallel limit (default: 8)
 *   node batch-probe.js --out found.json       # output file (default: found.json)
 *   node batch-probe.js --ats greenhouse       # only probe one ATS type
 *
 * Output: found.json — array of source configs ready for DB seeding.
 * Run seed after: node seed-found.js
 */
require('dotenv').config();
const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag, def = null) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const concurrency = parseInt(getArg('--concurrency', '8'));
const outFile     = getArg('--out', path.join(__dirname, 'found.json'));
const onlyAts     = getArg('--ats', null);
const candidatesFile = getArg('--candidates', path.join(__dirname, 'candidates.json'));

if (!fs.existsSync(candidatesFile)) {
  console.error('candidates.json not found next to this script');
  process.exit(1);
}

const candidates = JSON.parse(fs.readFileSync(candidatesFile, 'utf8'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// ─── Token variants to try for each company ──────────────────────────────────
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

const MIN_JOBS = 1; // discard sources with zero live jobs

// ─── ATS validators ──────────────────────────────────────────────────────────
// Each check() returns { config, jobCount } on hit, or null on miss.
const VALIDATORS = {
  greenhouse: {
    async check(token) {
      const { data } = await axios.get(
        `https://boards-api.greenhouse.io/v1/boards/${token}/jobs`,
        { params: { content: false }, timeout: 8000, headers: { 'User-Agent': UA } }
      );
      if (!Array.isArray(data?.jobs)) return null;
      return { config: { ats: 'greenhouse', greenhouseToken: token }, jobCount: data.jobs.length };
    },
  },
  lever: {
    async check(token) {
      const { data } = await axios.get(
        `https://api.lever.co/v0/postings/${token}`,
        { params: { mode: 'json' }, timeout: 8000, headers: { 'User-Agent': UA } }
      );
      if (!Array.isArray(data)) return null;
      return { config: { ats: 'lever', leverToken: token }, jobCount: data.length };
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
      return { config: { ats: 'ashby', ashbySlug: slug }, jobCount: jobs.length };
    },
  },
  smartrecruiters: {
    async check(slug) {
      const { data } = await axios.get(
        `https://api.smartrecruiters.com/v1/companies/${slug}/postings`,
        { params: { limit: 1 }, timeout: 8000, headers: { 'User-Agent': UA } }
      );
      if (!Array.isArray(data?.content)) return null;
      // fetch total count for yield check
      const { data: full } = await axios.get(
        `https://api.smartrecruiters.com/v1/companies/${slug}/postings`,
        { params: { limit: 100 }, timeout: 8000, headers: { 'User-Agent': UA } }
      );
      return { config: { ats: 'smartrecruiters', smartrecruitersSlug: slug }, jobCount: full?.content?.length ?? 0 };
    },
  },
};

const ATS_NAMES = onlyAts ? [onlyAts] : Object.keys(VALIDATORS);

// ─── Probe single candidate ──────────────────────────────────────────────────
async function probeOne({ company, tokens: hints = [] }) {
  const variants = tokenVariants(company, hints);

  for (const atsName of ATS_NAMES) {
    const validator = VALIDATORS[atsName];
    if (!validator) continue;

    for (const token of variants) {
      try {
        const hit = await validator.check(token);
        if (!hit) continue;
        if (hit.jobCount < MIN_JOBS) return null; // valid ATS board but empty — skip
        return { company, ...hit.config, lastJobCount: hit.jobCount };
      } catch {
        // expected — wrong token or wrong ATS
      }
    }
  }
  return null;
}

// ─── Concurrency pool ────────────────────────────────────────────────────────
async function runPool(tasks, limit) {
  const results = [];
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      const task = tasks[i];
      const result = await task();
      results[i] = result;
    }
  }

  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  // Skip companies already in sources.js
  const existing = new Set(
    require('../config/sources').map(s => s.company.toLowerCase())
  );

  const todo = candidates.filter(c => !existing.has(c.company.toLowerCase()));
  const skip = candidates.length - todo.length;

  console.log(`\nBatch probe: ${todo.length} candidates  (${skip} already in sources, skipped)`);
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
}

main().catch(e => { console.error(e.message); process.exit(1); });
