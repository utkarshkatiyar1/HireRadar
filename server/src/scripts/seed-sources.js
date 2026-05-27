#!/usr/bin/env node
/**
 * One-time migration: imports all static sources from config/sources.js into MongoDB.
 * Safe to re-run — uses upsert on company name, never overwrites existing DB entries.
 *
 * Usage: node seed-sources.js
 */
require('dotenv').config();
const { connect, Source } = require('../utils/db');

// Raw sources before DEFAULTS injection
const { raw } = require('../config/sources');

async function seed() {
  await connect();
  console.log('Connected. Seeding sources...\n');

  let inserted = 0, skipped = 0;

  for (const src of raw) {
    // Strip DEFAULTS fields from each entry — they're applied at runtime
    const { keywords, locations, maxExp, ...rest } = src;
    const res = await Source.updateOne(
      { company: rest.company },
      { $setOnInsert: rest },
      { upsert: true }
    );
    if (res.upsertedCount) {
      console.log(`  + ${rest.company} (${rest.ats})`);
      inserted++;
    } else {
      console.log(`  ~ ${rest.company} (already exists, skipped)`);
      skipped++;
    }
  }

  console.log(`\nDone. Inserted: ${inserted}  Skipped: ${skipped}`);
  process.exit(0);
}

seed().catch(e => { console.error(e.message); process.exit(1); });
