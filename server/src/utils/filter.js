const DEFAULTS = {
  locationAllow: [
    'india', 'remote', 'hybrid', 'anywhere', 'worldwide', 'global', 'work from home', 'wfh',
    'bangalore', 'bengaluru', 'mumbai', 'hyderabad', 'pune', 'chennai',
    'delhi', 'noida', 'gurgaon', 'gurugram', 'kolkata', 'new delhi',
    'ahmedabad', 'jaipur', 'kochi', 'lucknow', 'kanpur', 'indore',
    'bhopal', 'surat', 'vadodara', 'nagpur', 'coimbatore', 'vizag',
    'visakhapatnam', 'chandigarh', 'patna', 'bhubaneswar', 'mysuru',
    'mysore', 'thiruvananthapuram', 'trivandrum', 'ranchi', 'agra',
  ],
  seniorityExclude: [
    'senior', ' sr ', 'sr.', 'staff', 'principal', 'lead ',
    'manager', 'director', 'vp ', 'vice president',
    'head of', 'architect', 'distinguished', 'fellow',
    'tech lead', 'technical lead',
    'sales', 'account executive', 'account manager', 'business development',
    'recruiter', 'recruiting', 'talent acquisition',
    'marketing', 'finance', 'legal', 'counsel', 'operations',
    'customer success', 'customer support', 'support engineer',
    'data scientist', 'data analyst', 'analyst',
    'payroll', 'specialist', 'coordinator', 'curation', 'labeling',
    'content writer', 'copywriter', 'graphic design',
  ],
  frontendSignals: [
    'react', 'next', 'nextjs', 'javascript', 'typescript',
    'frontend', 'front end', 'front-end', 'ui', 'web',
    'html', 'css', 'browser', 'dom',
    'vite', 'webpack', 'spa',
  ],
  juniorSignals: [
    'junior', 'jr ', 'entry level', 'entry-level', 'new grad',
    'fresh', 'associate engineer', 'associate developer', 'associate sde',
    'early career', 'graduate',
    'sde i', 'sde-i', 'sde1', 'engineer i', 'engineer-i',
    'sde ii', 'sde-ii', 'sde2', 'engineer ii', 'engineer-ii',
    'level 3', 'level 4', 'l3', 'l4',
    'mid level', 'mid-level', 'midlevel',
    'product engineer', 'application engineer',
    'ui platform', 'web platform',
  ],
  negativeSignals: [
    'backend', 'back end', 'back-end',
    'data engineer', 'data scientist', 'machine learning', 'ml ',
    'devops', 'infrastructure', 'platform reliability',
    'firmware', 'embedded', 'security engineer', 'site reliability',
    'sre', 'database', 'network engineer', 'cloud ops',
    'android', 'ios', 'mobile engineer',
    'qa engineer', 'test engineer', 'sdet',
  ],
  scoreThreshold: 0,
};

const isLocationOk = (location, prefs = DEFAULTS) => {
  const loc = (location || '').toLowerCase().trim();
  if (!loc) return true;
  const allow = prefs.locationAllow?.length ? prefs.locationAllow : DEFAULTS.locationAllow;
  return allow.some(k => loc.includes(k));
};

const isSenior = (title, prefs = DEFAULTS) => {
  const t = (title || '').toLowerCase();
  const exclude = prefs.seniorityExclude?.length ? prefs.seniorityExclude : DEFAULTS.seniorityExclude;
  return exclude.some(k => t.includes(k));
};

const scoreJob = (j, prefs = DEFAULTS) => {
  const text = [j.title || '', j.department || '', j.exp || ''].join(' ').toLowerCase();
  let score = 0;
  const fs = prefs.frontendSignals?.length ? prefs.frontendSignals : DEFAULTS.frontendSignals;
  const js = prefs.juniorSignals?.length   ? prefs.juniorSignals   : DEFAULTS.juniorSignals;
  const ns = prefs.negativeSignals?.length ? prefs.negativeSignals : DEFAULTS.negativeSignals;
  fs.forEach(k => { if (text.includes(k)) score += 3; });
  js.forEach(k => { if (text.includes(k)) score += 2; });
  ns.forEach(k => { if (text.includes(k)) score -= 3; });
  return score;
};

// scrapeFilter: store everything, filter nothing at scrape time
const scrapeFilter = (jobs) => jobs;

module.exports = { DEFAULTS, scrapeFilter, isLocationOk, isSenior, scoreJob };
