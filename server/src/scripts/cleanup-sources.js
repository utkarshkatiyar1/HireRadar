#!/usr/bin/env node
/**
 * Fixes two classes of broken sources:
 *
 *   RECOVER  — disabled sources where the scraper actually works (rate-limit
 *              victims, transient network errors). Re-enabled + failures reset.
 *
 *   DELETE   — sources scraped at least once that returned 0 jobs every time.
 *              These have no relevant openings and are genuine dead weight.
 *
 * Usage:
 *   node cleanup-sources.js           # dry run — shows what would change
 *   node cleanup-sources.js --apply   # apply changes
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const axios = require('axios');
const { connect, Source } = require('../utils/db');

const apply = process.argv.includes('--apply');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// Quick live-check per ATS — just verifies the endpoint responds with >= 1 job
async function isAlive(src) {
  try {
    if (src.ats === 'ashby') {
      const { data } = await axios.get(
        `https://api.ashbyhq.com/posting-api/job-board/${src.ashbySlug}`,
        { timeout: 10000, headers: { 'User-Agent': UA } }
      );
      return ((data?.jobs ?? data?.jobPostings ?? []).length) > 0;
    }
    if (src.ats === 'greenhouse') {
      const { data } = await axios.get(
        `https://boards-api.greenhouse.io/v1/boards/${src.greenhouseToken}/jobs`,
        { params: { content: false }, timeout: 10000, headers: { 'User-Agent': UA } }
      );
      return Array.isArray(data?.jobs) && data.jobs.length > 0;
    }
    if (src.ats === 'lever') {
      const { data } = await axios.get(
        `https://api.lever.co/v0/postings/${src.leverToken}`,
        { params: { mode: 'json' }, timeout: 10000, headers: { 'User-Agent': UA } }
      );
      return Array.isArray(data) && data.length > 0;
    }
    if (src.ats === 'smartrecruiters') {
      const { data } = await axios.get(
        `https://api.smartrecruiters.com/v1/companies/${src.smartrecruitersSlug}/postings`,
        { params: { limit: 1 }, timeout: 10000, headers: { 'User-Agent': UA } }
      );
      return Array.isArray(data?.content) && data.content.length > 0;
    }
    // workday, eightfold, taleo-ssr, playwright, custom — trust the failure count
    return false;
  } catch {
    return false;
  }
}

async function main() {
  await connect();

  const disabled   = await Source.find({ enabled: false }).lean();
  const zeroScraped = await Source.find({
    enabled: true,
    lastJobCount: 0,
    lastScrapedAt: { $ne: null },
  }).lean();

  console.log(`\nChecking ${disabled.length} disabled sources for recoverability...`);

  const toRecover = [];
  const toDelete  = [];

  // Check disabled sources live
  await Promise.all(disabled.map(async src => {
    const alive = await isAlive(src);
    if (alive) toRecover.push(src);
    else        toDelete.push(src);
  }));

  // Zero-job enabled sources are deleted outright (no live check needed —
  // they already ran and returned nothing)
  toDelete.push(...zeroScraped);

  console.log(`\n${ apply ? '' : '[DRY RUN] '}RECOVER (${toRecover.length}) — disabled but alive, will re-enable:`);
  for (const s of toRecover)
    console.log(`  +  ${s.company.padEnd(30)} ${s.ats}`);

  console.log(`\n${ apply ? '' : '[DRY RUN] '}DELETE (${toDelete.length}) — dead or empty:`);
  for (const s of toDelete) {
    const reason = !s.enabled
      ? `${s.consecutiveFailures} failures, unreachable`
      : `scraped ${s.lastScrapedAt?.toDateString()} → 0 jobs`;
    console.log(`  x  ${s.company.padEnd(30)} ${s.ats.padEnd(16)} ${reason}`);
  }

  if (!apply) {
    console.log(`\nDry run — pass --apply to make changes.`);
    process.exit(0);
  }

  if (toRecover.length) {
    await Source.updateMany(
      { _id: { $in: toRecover.map(s => s._id) } },
      { $set: { enabled: true, consecutiveFailures: 0 } }
    );
    console.log(`\nRe-enabled ${toRecover.length} sources.`);
  }

  if (toDelete.length) {
    const { deletedCount } = await Source.deleteMany({ _id: { $in: toDelete.map(s => s._id) } });
    console.log(`Deleted ${deletedCount} sources.`);
  }

  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
