#!/usr/bin/env node
/**
 * Imports batch-probe.js output (found.json) into the Source collection.
 * Safe to re-run — skips companies that already exist.
 *
 * Usage: node seed-found.js [path/to/found.json]
 */
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { connect, Source } = require('../utils/db');

const inFile = process.argv[2] || path.join(__dirname, 'found.json');

async function seed() {
  if (!fs.existsSync(inFile)) {
    console.error(`File not found: ${inFile}`);
    process.exit(1);
  }

  const found = JSON.parse(fs.readFileSync(inFile, 'utf8'));
  await connect();
  console.log(`\nSeeding ${found.length} validated sources...\n`);

  let inserted = 0, skipped = 0;

  for (const src of found) {
    const res = await Source.updateOne(
      { company: src.company },
      { $setOnInsert: src },
      { upsert: true }
    );
    if (res.upsertedCount) {
      console.log(`  + ${src.company} (${src.ats})`);
      inserted++;
    } else {
      console.log(`  ~ ${src.company} (already exists)`);
      skipped++;
    }
  }

  console.log(`\nDone. Inserted: ${inserted}  Skipped: ${skipped}`);
  process.exit(0);
}

seed().catch(e => { console.error(e.message); process.exit(1); });
