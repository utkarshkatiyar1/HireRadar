#!/usr/bin/env node
/**
 * Usage: node probe.js "Company Name" https://company.com/careers
 *
 * Fetches the careers page, detects ATS type, extracts token/slug,
 * validates against the real API, and prints the sources.js entry.
 *
 * If the page doesn't expose the ATS directly, also tries common
 * token guesses (company name variants) against each known ATS.
 */
require('dotenv').config();
const axios = require('axios');

const [,, company, careersUrl] = process.argv;

if (!company || !careersUrl) {
  console.error('Usage: node probe.js "Company Name" https://company.com/careers');
  process.exit(1);
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ─── ATS definitions ──────────────────────────────────────────────────────────

const ATS = {
  greenhouse: {
    detect(url, html) {
      const patterns = [
        /boards(?:-api)?\.greenhouse\.io\/(?:v1\/boards\/)?([a-z0-9_-]+)/gi,
        /embed\.greenhouse\.io\/embed\/job_board\?(?:[^"']*&)?token=([a-z0-9_-]+)/gi,
      ];
      const text = url + '\n' + html;
      for (const re of patterns) {
        const hits = [...text.matchAll(re)];
        if (hits.length) return hits[0][1].toLowerCase();
      }
      return null;
    },
    async validate(token) {
      const { data } = await axios.get(
        `https://boards-api.greenhouse.io/v1/boards/${token}/jobs`,
        { params: { content: false }, timeout: 10000, headers: { 'User-Agent': UA } }
      );
      return Array.isArray(data?.jobs);
    },
    entry: (name, token) =>
      `{ company: '${name}', ats: 'greenhouse', greenhouseToken: '${token}' }`,
  },

  lever: {
    detect(url, html) {
      const re = /(?:jobs|api)\.lever\.co\/(?:v0\/postings\/)?([a-z0-9_-]+)/gi;
      const hits = [...(url + '\n' + html).matchAll(re)];
      return hits.length ? hits[0][1].toLowerCase() : null;
    },
    async validate(token) {
      const { data } = await axios.get(
        `https://api.lever.co/v0/postings/${token}`,
        { params: { mode: 'json' }, timeout: 10000, headers: { 'User-Agent': UA } }
      );
      return Array.isArray(data);
    },
    entry: (name, token) =>
      `{ company: '${name}', ats: 'lever', leverToken: '${token}' }`,
  },

  ashby: {
    detect(url, html) {
      const patterns = [
        /jobs\.ashbyhq\.com\/([a-z0-9_-]+)/gi,
        /api\.ashbyhq\.com\/posting-api\/job-board\/([a-z0-9_-]+)/gi,
      ];
      const text = url + '\n' + html;
      for (const re of patterns) {
        const hits = [...text.matchAll(re)];
        if (hits.length) return hits[0][1].toLowerCase();
      }
      return null;
    },
    async validate(slug) {
      const { data } = await axios.get(
        `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
        { timeout: 10000, headers: { 'User-Agent': UA } }
      );
      return !!(data?.jobs || data?.jobPostings);
    },
    entry: (name, slug) =>
      `{ company: '${name}', ats: 'ashby', ashbySlug: '${slug}' }`,
  },

  smartrecruiters: {
    detect(url, html) {
      const patterns = [
        /(?:careers|jobs)\.smartrecruiters\.com\/([a-zA-Z0-9_-]+)/g,
        /api\.smartrecruiters\.com\/v1\/companies\/([a-zA-Z0-9_-]+)/g,
      ];
      const text = url + '\n' + html;
      for (const re of patterns) {
        const hits = [...text.matchAll(re)];
        if (hits.length) return hits[0][1];
      }
      return null;
    },
    async validate(slug) {
      const { data } = await axios.get(
        `https://api.smartrecruiters.com/v1/companies/${slug}/postings`,
        { params: { limit: 1 }, timeout: 10000, headers: { 'User-Agent': UA } }
      );
      return Array.isArray(data?.content);
    },
    entry: (name, slug) =>
      `{ company: '${name}', ats: 'smartrecruiters', smartrecruitersSlug: '${slug}' }`,
  },

  workday: {
    detect(url, html) {
      // Matches: tenant.wd1.myworkdayjobs.com/en-US/SiteName or /SiteName
      const re = /([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com(?:\/[a-z]{2}-[A-Z]{2})?\/([a-zA-Z0-9_-]+)/g;
      const hits = [...(url + '\n' + html).matchAll(re)];
      if (!hits.length) return null;
      const [, tenant, wdNum, rawSite] = hits[0];
      // Skip generic path segments that aren't the site name
      const skip = new Set(['job', 'jobs', 'search', 'apply', 'home', 'External']);
      const site = skip.has(rawSite) ? 'jobs' : rawSite;
      return { tenant, wdNum, site };
    },
    async validate({ tenant, wdNum, site }) {
      const base = `https://${tenant}.${wdNum}.myworkdayjobs.com`;
      await axios.post(
        `${base}/wday/cxs/${tenant}/${site}/jobs`,
        { appliedFacets: {}, limit: 1, offset: 0, searchText: '' },
        { timeout: 10000, headers: { 'Content-Type': 'application/json', 'User-Agent': UA } }
      );
      return true;
    },
    entry(name, { tenant, wdNum, site }) {
      const base = `https://${tenant}.${wdNum}.myworkdayjobs.com`;
      return (
        `{\n    company:       '${name}',\n` +
        `    ats:           'workday',\n` +
        `    workdayBase:   '${base}',\n` +
        `    workdayTenant: '${tenant}',\n` +
        `    workdaySite:   '${site}',\n  }`
      );
    },
  },

  eightfold: {
    detect(url, html) {
      const re = /([a-z0-9-]+)\.eightfold\.ai/gi;
      const hits = [...(url + '\n' + html).matchAll(re)];
      return hits.length ? hits[0][1].toLowerCase() : null;
    },
    async validate() { return true; }, // no public API to validate
    entry: (name, subdomain) =>
      `{ company: '${name}', ats: 'eightfold', eightfoldBase: 'https://${subdomain}.eightfold.ai' }`,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchPage(url) {
  const r = await axios.get(url, {
    timeout: 20000,
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*' },
    maxRedirects: 10,
  });
  const html = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
  const finalUrl = r.request?.res?.responseUrl ?? r.config?.url ?? url;
  return { html, finalUrl };
}

async function tryValidate(ats, token) {
  try {
    return await ats.validate(token);
  } catch {
    return false;
  }
}

function tokenGuesses(name) {
  const base = name.toLowerCase();
  return [...new Set([
    base.replace(/[^a-z0-9]/g, ''),
    base.replace(/\s+/g, '-'),
    base.replace(/\s+/g, '_'),
    base.replace(/\s+/g, ''),
  ])];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function probe() {
  console.log(`\nProbing: ${company}`);
  console.log(`    URL: ${careersUrl}\n`);

  // Fetch careers page
  process.stdout.write('Fetching page... ');
  let html = '', finalUrl = careersUrl;
  try {
    ({ html, finalUrl } = await fetchPage(careersUrl));
    console.log('OK');
    if (finalUrl !== careersUrl) console.log(`  Redirected → ${finalUrl}`);
  } catch (e) {
    console.log(`FAILED: ${e.message}`);
    console.log('\nCould not fetch page. Try manually: open DevTools → Network → search for ATS URLs.');
    return;
  }

  // --- Phase 1: detect from URL + page HTML ---
  for (const [name, ats] of Object.entries(ATS)) {
    const token = ats.detect(finalUrl, html);
    if (!token) continue;

    const tokenStr = typeof token === 'string' ? token : JSON.stringify(token);
    console.log(`\nDetected ATS: ${name.toUpperCase()}`);
    console.log(`     Token: ${tokenStr}`);

    process.stdout.write('\nValidating API... ');
    const valid = await tryValidate(ats, token);
    console.log(valid ? 'OK' : 'FAILED (unexpected response)');

    console.log('\n── Add to sources.js ──────────────────────────────');
    console.log(`  ${ats.entry(company, token)}`);
    console.log('────────────────────────────────────────────────────\n');

    if (!valid) {
      console.log('Warning: validation failed. Token may be wrong — double-check in DevTools.');
    }
    return;
  }

  // --- Phase 2: guess common token formats ---
  console.log('\nATS not found in page. Trying token guesses...\n');
  const guesses = tokenGuesses(company);

  for (const [name, ats] of Object.entries(ATS)) {
    if (name === 'workday' || name === 'eightfold') continue;
    for (const g of guesses) {
      process.stdout.write(`  ${name.padEnd(16)} / ${g.padEnd(30)} `);
      const valid = await tryValidate(ats, g);
      if (valid) {
        console.log('HIT ✓');
        console.log('\n── Add to sources.js ──────────────────────────────');
        console.log(`  ${ats.entry(company, g)}`);
        console.log('────────────────────────────────────────────────────\n');
        return;
      }
      console.log('-');
    }
  }

  console.log('\nCould not auto-detect ATS. Open DevTools on the careers page and look for network calls to:');
  console.log('  boards.greenhouse.io   →  ats: greenhouse');
  console.log('  jobs.lever.co          →  ats: lever');
  console.log('  jobs.ashbyhq.com       →  ats: ashby');
  console.log('  smartrecruiters.com    →  ats: smartrecruiters');
  console.log('  myworkdayjobs.com      →  ats: workday');
  console.log('  eightfold.ai           →  ats: eightfold\n');
}

probe().catch(e => { console.error(e.message); process.exit(1); });
