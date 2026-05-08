// -------- SCRAPE TIME --------
// Do NOT filter anything while scraping.
// Store everything. DB is cheap. Missing jobs is expensive.
const scrapeFilter = (jobs) => jobs;


// -------- LOCATION FILTER --------
// Pass if: no location set, OR location matches India/remote keywords.
// Drop if: location exists and is clearly non-India/non-remote.
const LOCATION_ALLOW = [
  'india', 'remote', 'hybrid', 'anywhere', 'worldwide', 'global', 'work from home', 'wfh',
  // metros
  'bangalore', 'bengaluru', 'mumbai', 'hyderabad', 'pune', 'chennai',
  'delhi', 'noida', 'gurgaon', 'gurugram', 'kolkata', 'new delhi',
  // tier 2
  'ahmedabad', 'jaipur', 'kochi', 'lucknow', 'kanpur', 'indore',
  'bhopal', 'surat', 'vadodara', 'nagpur', 'coimbatore', 'vizag',
  'visakhapatnam', 'chandigarh', 'patna', 'bhubaneswar', 'mysuru',
  'mysore', 'thiruvananthapuram', 'trivandrum', 'ranchi', 'agra',
];

const isLocationOk = (location) => {
  const loc = (location || '').toLowerCase().trim();
  if (!loc) return true;
  return LOCATION_ALLOW.some(k => loc.includes(k));
};


// -------- SENIORITY HARD EXCLUDE --------
// Checked on title only — most reliable field across all ATS.
const SENIORITY_EXCLUDE = [
  // seniority
  'senior', ' sr ', 'sr.', 'staff', 'principal', 'lead ',
  'manager', 'director', 'vp ', 'vice president',
  'head of', 'architect', 'distinguished', 'fellow',
  'tech lead', 'technical lead',
  // non-engineering roles
  'sales', 'account executive', 'account manager', 'business development',
  'recruiter', 'recruiting', 'talent acquisition',
  'marketing', 'finance', 'legal', 'counsel', 'operations',
  'customer success', 'customer support', 'support engineer',
  'data scientist', 'data analyst', 'analyst',
  'payroll', 'specialist', 'coordinator', 'curation', 'labeling',
  'content writer', 'copywriter', 'graphic design',
];

const isSenior = (title) => {
  const t = (title || '').toLowerCase();
  return SENIORITY_EXCLUDE.some(k => t.includes(k));
};


// -------- SCORING --------

const FRONTEND_SIGNALS = [
  'react', 'next', 'nextjs', 'javascript', 'typescript',
  'frontend', 'front end', 'front-end', 'ui', 'web',
  'html', 'css', 'browser', 'dom',
  'vite', 'webpack', 'spa',
];

// Junior / mid / entry level positive signals
const JUNIOR_MID_SIGNALS = [
  'junior', 'jr ', 'entry level', 'entry-level', 'new grad',
  'fresh', 'associate engineer', 'associate developer', 'associate sde',
  'early career', 'graduate',
  'sde i', 'sde-i', 'sde1', 'engineer i', 'engineer-i',
  'sde ii', 'sde-ii', 'sde2', 'engineer ii', 'engineer-ii',
  'level 3', 'level 4', 'l3', 'l4',
  'mid level', 'mid-level', 'midlevel',
  'product engineer', 'application engineer',
  'ui platform', 'web platform',
];

const NEGATIVE_SIGNALS = [
  'backend', 'back end', 'back-end',
  'data engineer', 'data scientist', 'machine learning', 'ml ',
  'devops', 'infrastructure', 'platform reliability',
  'firmware', 'embedded', 'security engineer', 'site reliability',
  'sre', 'database', 'network engineer', 'cloud ops',
  'android', 'ios', 'mobile engineer',
  'qa engineer', 'test engineer', 'sdet',
];

const scoreJob = (j) => {
  const text = [
    j.title      || '',
    j.department || '',
    j.exp        || '',
  ].join(' ').toLowerCase();

  let score = 0;

  FRONTEND_SIGNALS.forEach(k  => { if (text.includes(k)) score += 3; });
  JUNIOR_MID_SIGNALS.forEach(k => { if (text.includes(k)) score += 2; });
  NEGATIVE_SIGNALS.forEach(k  => { if (text.includes(k)) score -= 3; });

  return score;
};


// -------- API TIME FILTER --------
// 1. Hard-drop senior roles by title
// 2. Score remaining for frontend + seniority relevance
// 3. Keep score >= 3, sort best first
const apiFilter = (jobs) =>
  jobs
    .filter(j => !isSenior(j.title))
    .filter(j => isLocationOk(j.location))
    .map(j => ({ ...j, score: scoreJob(j) }))
    .filter(j => j.score >= 3)
    .sort((a, b) => b.score - a.score);


module.exports = { scrapeFilter, apiFilter, isLocationOk, isSenior, scoreJob };
