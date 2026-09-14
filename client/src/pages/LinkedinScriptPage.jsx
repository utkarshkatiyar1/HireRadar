import { useState, useMemo } from 'react';
import { LINKEDIN_TEMPLATE, DEFAULT_LINKEDIN_CONFIG } from '../config/linkedinScriptTemplate';

const STORAGE_KEY = 'hireradar.linkedinScript.config.v1';

const EXPERIENCE_LEVEL_OPTIONS = [
  { value: '1', label: 'Internship' },
  { value: '2', label: 'Entry level' },
  { value: '3', label: 'Associate' },
  { value: '4', label: 'Mid-Senior level' },
  { value: '5', label: 'Director' },
  { value: '6', label: 'Executive' },
];

const TIME_FILTER_OPTIONS = [
  { value: 'r86400', label: 'Past 24 hours' },
  { value: 'r172800', label: 'Past 48 hours' },
  { value: 'r259200', label: 'Past 3 days' },
  { value: 'r604800', label: 'Past week' },
  { value: '', label: 'No filter (widest)' },
];

function linesToArray(text) {
  return text.split('\n').map(line => line.trim()).filter(Boolean);
}

function loadStoredConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function jsArrayLiteral(arr) {
  return '[\n' + arr.map(v => `      ${JSON.stringify(v)}`).join(',\n') + '\n    ]';
}

function generateScript(cfg) {
  return LINKEDIN_TEMPLATE
    .replace('__MAX_AGE_HOURS__', JSON.stringify(cfg.maxAgeHours))
    .replace('__MIN_SCORE__', JSON.stringify(cfg.minScore))
    .replace('__SESSION_SOFT_CAP__', JSON.stringify(cfg.sessionSoftCap))
    .replace('__TIME_FILTER__', JSON.stringify(cfg.timeFilter))
    .replace('__EXPERIENCE_LEVELS__', jsArrayLiteral(cfg.experienceLevels))
    .replace('__ROLES__', jsArrayLiteral(cfg.roles))
    .replace('__LOCATIONS__', jsArrayLiteral(cfg.locations))
    .replace('__EXCLUDED_COMPANIES__', jsArrayLiteral(cfg.excludedCompanies));
}

function toFormState(cfg) {
  return {
    maxAgeHours: String(cfg.maxAgeHours),
    minScore: String(cfg.minScore),
    sessionSoftCap: String(cfg.sessionSoftCap),
    timeFilter: cfg.timeFilter,
    experienceLevels: cfg.experienceLevels,
    roles: cfg.roles.join('\n'),
    locations: cfg.locations.join('\n'),
    excludedCompanies: cfg.excludedCompanies.join('\n'),
  };
}

export default function LinkedinScriptPage() {
  const [form, setForm] = useState(() => toFormState(loadStoredConfig() || DEFAULT_LINKEDIN_CONFIG));
  const [notice, setNotice] = useState('');

  const cfg = useMemo(() => ({
    maxAgeHours: Number(form.maxAgeHours) || 0,
    minScore: Number(form.minScore) || 0,
    sessionSoftCap: Number(form.sessionSoftCap) || 1,
    timeFilter: form.timeFilter,
    experienceLevels: form.experienceLevels,
    roles: linesToArray(form.roles),
    locations: linesToArray(form.locations),
    excludedCompanies: linesToArray(form.excludedCompanies),
  }), [form]);

  const searchCount = cfg.roles.length * cfg.locations.length;
  const script = useMemo(() => generateScript(cfg), [cfg]);

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const toggleExperienceLevel = (value) => {
    setForm(f => {
      const has = f.experienceLevels.includes(value);
      return {
        ...f,
        experienceLevels: has
          ? f.experienceLevels.filter(v => v !== value)
          : [...f.experienceLevels, value],
      };
    });
  };

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 2200);
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    flash('✓ Saved locally');
  };

  const handleReset = () => {
    setForm(toFormState(DEFAULT_LINKEDIN_CONFIG));
    flash('Reset to defaults (not saved yet)');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      flash('✓ Copied to clipboard');
    } catch {
      flash('Copy failed — select manually');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([script], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'linkedin-power-search.js';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <main>
      <div className="profile-page">
        <div className="profile-section-label">
          <span>LinkedIn Power Search</span>
          <span className="profile-section-label-sub">
            Generates a browser-console script that reads the job cards already rendered on
            linkedin.com/jobs/search — no internal API calls, no auto-apply, no messaging. You
            manually click "Next Search" to advance through your role × location queue like normal
            browsing; the script scores and aggregates what's on screen into a persistent dashboard
            across runs. LinkedIn polices automated access far more aggressively than Naukri, so this
            stays read-only and self-paced by design — a session counter nudges you to take a break
            after a few searches rather than grinding the whole queue at once.
          </span>
        </div>

        <div className="ns-layout">
          <div className="ns-config-col">
            <div className="profile-section">
              <div className="profile-section-top">
                <span className="profile-section-icon">📊</span>
                <div className="profile-section-meta">
                  <div className="profile-section-title">Freshness, scoring &amp; pacing</div>
                </div>
              </div>
              <div className="ns-grid-3">
                <label className="cpf-field">
                  Max job age (hours)
                  <input className="cpf-years-input" type="number" value={form.maxAgeHours} onChange={set('maxAgeHours')} />
                </label>
                <label className="cpf-field">
                  Min score threshold
                  <input className="cpf-years-input" type="number" value={form.minScore} onChange={set('minScore')} />
                </label>
                <label className="cpf-field">
                  Session soft cap
                  <input className="cpf-years-input" type="number" value={form.sessionSoftCap} onChange={set('sessionSoftCap')} />
                </label>
              </div>
              <div className="profile-section-desc">
                Session soft cap: after this many "Next Search" clicks in one browser session, the
                dashboard shows a reminder to take a break — it doesn't block you, just discourages
                grinding the whole queue in one sitting.
              </div>
            </div>

            <div className="profile-section">
              <div className="profile-section-top">
                <span className="profile-section-icon">🕐</span>
                <div className="profile-section-meta">
                  <div className="profile-section-title">LinkedIn search filters</div>
                  <div className="profile-section-desc">
                    Applied as URL parameters on each search — a coarse pre-filter only. The script's
                    own DOM-parsed "posted X hours ago" freshness check is the real gate.
                  </div>
                </div>
              </div>
              <label className="cpf-field">
                Date posted
                <select className="cpf-years-input" style={{ width: '100%' }} value={form.timeFilter} onChange={set('timeFilter')}>
                  {TIME_FILTER_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <div className="tag-list" style={{ marginTop: 8 }}>
                {EXPERIENCE_LEVEL_OPTIONS.map(opt => {
                  const active = cfg.experienceLevels.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className="tag-pill"
                      style={{
                        cursor: 'pointer',
                        '--pill-color': active ? 'var(--primary)' : 'var(--text-3)',
                        opacity: active ? 1 : 0.6,
                      }}
                      onClick={() => toggleExperienceLevel(opt.value)}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="profile-section">
              <div className="profile-section-top">
                <span className="profile-section-icon">🔎</span>
                <div className="profile-section-meta">
                  <div className="profile-section-title">Roles</div>
                  <div className="profile-section-desc">One per line. Combined with every location below into a search queue.</div>
                </div>
              </div>
              <textarea className="cpf-textarea" rows={10} value={form.roles} onChange={set('roles')} />
            </div>

            <div className="profile-section">
              <div className="profile-section-top">
                <span className="profile-section-icon">📍</span>
                <div className="profile-section-meta">
                  <div className="profile-section-title">Locations</div>
                  <div className="profile-section-desc">One per line, as LinkedIn expects them (city names, capitalized).</div>
                </div>
              </div>
              <textarea className="cpf-textarea" rows={5} value={form.locations} onChange={set('locations')} />
              <div className="profile-section-desc">
                {cfg.roles.length} role{cfg.roles.length === 1 ? '' : 's'} × {cfg.locations.length} location{cfg.locations.length === 1 ? '' : 's'} = <strong>{searchCount}</strong> searches in the queue.
                {searchCount > 30 && ' That\'s a large queue — you\'ll be relying entirely on the session soft cap and your own pacing to spread it out over multiple sittings.'}
              </div>
            </div>

            <div className="profile-section">
              <div className="profile-section-top">
                <span className="profile-section-icon">🚫</span>
                <div className="profile-section-meta">
                  <div className="profile-section-title">Excluded companies</div>
                  <div className="profile-section-desc">One per line. Word-boundary match — "tcs" won't falsely match "TCSynergy."</div>
                </div>
              </div>
              <textarea className="cpf-textarea" rows={6} value={form.excludedCompanies} onChange={set('excludedCompanies')} />
            </div>

            <div className="ns-actions">
              <button className="tag-add-btn" onClick={handleReset}>Reset to defaults</button>
              <button className="tag-add-btn ns-btn-primary" onClick={handleSave}>Save config</button>
            </div>
            {notice && <div className="ns-notice">{notice}</div>}
          </div>

          <div className="ns-output-col">
            <div className="profile-section ns-sticky">
              <div className="profile-section-top">
                <span className="profile-section-icon">📜</span>
                <div className="profile-section-meta">
                  <div className="profile-section-title">Generated script</div>
                  <div className="profile-section-desc">
                    Go to{' '}
                    <a href="https://www.linkedin.com/jobs/search/" target="_blank" rel="noopener noreferrer">linkedin.com/jobs/search</a>{' '}
                    while logged in, open the console, and paste this. It reads whatever job cards are
                    already on screen — no auth capture needed. Click "Next Search" in the dashboard it
                    opens to advance through your queue.
                  </div>
                </div>
              </div>
              <div className="ns-actions">
                <button className="tag-add-btn ns-btn-primary" onClick={handleCopy}>Copy script</button>
                <button className="tag-add-btn" onClick={handleDownload}>Download .js</button>
              </div>
              <pre className="ns-script-preview">{script}</pre>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
