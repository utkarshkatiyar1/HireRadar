import { useState, useMemo } from 'react';
import { NAUKRI_TEMPLATE, DEFAULT_NAUKRI_CONFIG, NAUKRI_PROFILES, DEFAULT_NAUKRI_PROFILE_ID } from '../config/naukriScriptTemplate';
import { useToasts, ToastStack } from '../components/Toast';

const STORAGE_KEY = 'hireradar.naukriScript.config.v1';
const PROFILE_STORAGE_KEY = 'hireradar.naukriScript.profileId.v1';

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

function loadStoredProfileId() {
  const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
  return NAUKRI_PROFILES.some(p => p.id === raw) ? raw : DEFAULT_NAUKRI_PROFILE_ID;
}

function getProfile(id) {
  return NAUKRI_PROFILES.find(p => p.id === id) || NAUKRI_PROFILES[0];
}

function jsArrayLiteral(arr) {
  return '[\n' + arr.map(v => `      ${JSON.stringify(v)}`).join(',\n') + '\n    ]';
}

function generateScript(cfg) {
  return NAUKRI_TEMPLATE
    .replace('__MY_EXPERIENCE__', JSON.stringify(cfg.myExperience))
    .replace('__MAX_MIN_EXPERIENCE__', JSON.stringify(cfg.maxMinimumExperience))
    .replace('__SEARCH_EXPERIENCE__', JSON.stringify(cfg.searchExperience))
    .replace('__MAX_ACTUAL_AGE_DAYS__', JSON.stringify(cfg.maxActualAgeDays))
    .replace('__PAGES_PER_SEARCH__', JSON.stringify(cfg.pagesPerSearch))
    .replace('__RESULTS_PER_PAGE__', JSON.stringify(cfg.resultsPerPage))
    .replace('__CONCURRENCY__', JSON.stringify(cfg.concurrency))
    .replace('__MIN_SCORE__', JSON.stringify(cfg.minScore))
    .replace('__BATCH_DELAY_MS__', JSON.stringify(cfg.batchDelayMs))
    .replace('__LOCATIONS__', jsArrayLiteral(cfg.locations))
    .replace('__SEARCHES__', jsArrayLiteral(cfg.searches))
    .replace('__EXCLUDED_COMPANIES__', jsArrayLiteral(cfg.excludedCompanies));
}

function sharedFormFromConfig(stored) {
  return {
    myExperience: String(stored.myExperience),
    maxMinimumExperience: String(stored.maxMinimumExperience),
    searchExperience: String(stored.searchExperience),
    maxActualAgeDays: String(stored.maxActualAgeDays),
    minScore: String(stored.minScore),
    concurrency: String(stored.concurrency),
    pagesPerSearch: String(stored.pagesPerSearch),
    resultsPerPage: String(stored.resultsPerPage),
    batchDelayMs: String(stored.batchDelayMs ?? DEFAULT_NAUKRI_CONFIG.batchDelayMs),
    locations: stored.locations.join('\n'),
    excludedCompanies: stored.excludedCompanies.join('\n'),
  };
}

export default function NaukriScriptPage() {
  const { toasts, showToast, dismiss } = useToasts();

  const [profileId, setProfileId] = useState(loadStoredProfileId);
  const [form, setForm] = useState(() => sharedFormFromConfig(loadStoredConfig() || DEFAULT_NAUKRI_CONFIG));
  const [searchesText, setSearchesText] = useState(() => {
    const stored = loadStoredConfig();
    // Prefer whatever was hand-edited/saved last time; only fall back to the
    // profile's preset keywords if nothing has ever been saved.
    return stored ? stored.searches.join('\n') : getProfile(loadStoredProfileId()).searches.join('\n');
  });

  const cfg = useMemo(() => ({
    myExperience: Number(form.myExperience) || 0,
    maxMinimumExperience: Number(form.maxMinimumExperience) || 0,
    searchExperience: Number(form.searchExperience) || 0,
    maxActualAgeDays: Number(form.maxActualAgeDays) || 0,
    minScore: Number(form.minScore) || 0,
    concurrency: Number(form.concurrency) || 1,
    pagesPerSearch: Number(form.pagesPerSearch) || 1,
    resultsPerPage: Number(form.resultsPerPage) || 20,
    batchDelayMs: Number(form.batchDelayMs) || 0,
    locations: linesToArray(form.locations),
    searches: linesToArray(searchesText),
    excludedCompanies: linesToArray(form.excludedCompanies),
  }), [form, searchesText]);

  const script = useMemo(() => generateScript(cfg), [cfg]);
  const activeProfile = getProfile(profileId);

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const handleProfileChange = (id) => {
    setProfileId(id);
    localStorage.setItem(PROFILE_STORAGE_KEY, id);
    setSearchesText(getProfile(id).searches.join('\n'));
    showToast(`Switched to "${getProfile(id).label}" — search keywords updated.`, { tone: 'info' });
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    showToast('Config saved locally.');
  };

  const handleReset = () => {
    setForm(sharedFormFromConfig(DEFAULT_NAUKRI_CONFIG));
    setSearchesText(activeProfile.searches.join('\n'));
    showToast('Reset to defaults — not saved yet.', { tone: 'info' });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      showToast(`Copied "${activeProfile.label}" script to clipboard — paste it into the console on the matching Naukri profile.`);
    } catch {
      showToast('Copy failed — select the script text manually.', { tone: 'error' });
    }
  };

  const handleDownload = () => {
    const blob = new Blob([script], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `naukri-power-search-${activeProfile.id}.js`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`Downloaded naukri-power-search-${activeProfile.id}.js`);
  };

  return (
    <main>
      <div className="profile-page">
        <div className="profile-section-label">
          <span>Naukri Power Search</span>
          <span className="profile-section-label-sub">
            Generates a browser-console bookmarklet that scrapes Naukri's search API, scores each
            job against your stack/experience/freshness rules, and renders a filterable dashboard —
            entirely client-side. Naukri's session auth can't be captured server-side, so paste the
            generated script into the console on naukri.com yourself; it'll prompt for a
            "Copy as fetch" of the <code>jobapi/v3/search</code> network request the first time.
          </span>
        </div>

        <div className="ns-layout">
          <div className="ns-config-col">
            <div className="profile-section">
              <div className="profile-section-top">
                <span className="profile-section-icon">🧑‍💼</span>
                <div className="profile-section-meta">
                  <div className="profile-section-title">Naukri profile</div>
                  <div className="profile-section-desc">
                    You've got two Naukri logins, each with a different resume. Everything below
                    (experience, freshness, locations, excluded companies) is shared — only the
                    search keywords switch per profile.
                  </div>
                </div>
              </div>
              <div className="ns-profile-toggle">
                {NAUKRI_PROFILES.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    className={`ns-profile-btn${p.id === profileId ? ' active' : ''}`}
                    onClick={() => handleProfileChange(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="profile-section-desc">{activeProfile.description}</div>
            </div>

            <div className="profile-section">
              <div className="profile-section-top">
                <span className="profile-section-icon">🎯</span>
                <div className="profile-section-meta">
                  <div className="profile-section-title">Experience</div>
                </div>
              </div>
              <div className="ns-grid-3">
                <label className="cpf-field">
                  My experience (yrs)
                  <input className="cpf-years-input" type="number" step="0.1" value={form.myExperience} onChange={set('myExperience')} />
                </label>
                <label className="cpf-field">
                  Max minimum experience allowed
                  <input className="cpf-years-input" type="number" step="0.1" value={form.maxMinimumExperience} onChange={set('maxMinimumExperience')} />
                </label>
                <label className="cpf-field">
                  Search experience filter
                  <input className="cpf-years-input" type="number" step="0.1" value={form.searchExperience} onChange={set('searchExperience')} />
                </label>
              </div>
            </div>

            <div className="profile-section">
              <div className="profile-section-top">
                <span className="profile-section-icon">📊</span>
                <div className="profile-section-meta">
                  <div className="profile-section-title">Freshness &amp; scoring</div>
                </div>
              </div>
              <div className="ns-grid-3">
                <label className="cpf-field">
                  Max job age (days)
                  <input className="cpf-years-input" type="number" value={form.maxActualAgeDays} onChange={set('maxActualAgeDays')} />
                </label>
                <label className="cpf-field">
                  Min score threshold
                  <input className="cpf-years-input" type="number" value={form.minScore} onChange={set('minScore')} />
                </label>
                <label className="cpf-field">
                  Concurrency
                  <input className="cpf-years-input" type="number" value={form.concurrency} onChange={set('concurrency')} />
                </label>
                <label className="cpf-field">
                  Pages per search
                  <input className="cpf-years-input" type="number" value={form.pagesPerSearch} onChange={set('pagesPerSearch')} />
                </label>
                <label className="cpf-field">
                  Results per page
                  <input className="cpf-years-input" type="number" value={form.resultsPerPage} onChange={set('resultsPerPage')} />
                </label>
                <label className="cpf-field">
                  Delay between batches (ms)
                  <input className="cpf-years-input" type="number" step="50" value={form.batchDelayMs} onChange={set('batchDelayMs')} />
                </label>
              </div>
              <div className="profile-section-desc">
                Naukri starts returning 406 errors near the end of large runs (200+ requests) if this
                is too low. Raise it if you see 406s in the console.
              </div>
            </div>

            <div className="profile-section">
              <div className="profile-section-top">
                <span className="profile-section-icon">📍</span>
                <div className="profile-section-meta">
                  <div className="profile-section-title">Locations</div>
                  <div className="profile-section-desc">One per line, lowercase city names.</div>
                </div>
              </div>
              <textarea className="cpf-textarea" rows={6} value={form.locations} onChange={set('locations')} />
            </div>

            <div className="profile-section">
              <div className="profile-section-top">
                <span className="profile-section-icon">🔎</span>
                <div className="profile-section-meta">
                  <div className="profile-section-title">Search keywords — {activeProfile.label}</div>
                  <div className="profile-section-desc">One per line. Each becomes a separate Naukri search. Switching profiles above replaces this list with that profile's preset.</div>
                </div>
              </div>
              <textarea className="cpf-textarea" rows={12} value={searchesText} onChange={e => setSearchesText(e.target.value)} />
            </div>

            <div className="profile-section">
              <div className="profile-section-top">
                <span className="profile-section-icon">🚫</span>
                <div className="profile-section-meta">
                  <div className="profile-section-title">Excluded companies</div>
                  <div className="profile-section-desc">One per line. Word-boundary match.</div>
                </div>
              </div>
              <textarea className="cpf-textarea" rows={6} value={form.excludedCompanies} onChange={set('excludedCompanies')} />
            </div>

            <div className="ns-actions">
              <button className="tag-add-btn" onClick={handleReset}>Reset to defaults</button>
              <button className="tag-add-btn ns-btn-primary" onClick={handleSave}>Save config</button>
            </div>
          </div>

          <div className="ns-output-col">
            <div className="profile-section ns-sticky">
              <div className="profile-section-top">
                <span className="profile-section-icon">📜</span>
                <div className="profile-section-meta">
                  <div className="profile-section-title">Generated script — {activeProfile.label}</div>
                  <div className="profile-section-desc">
                    Paste this into the browser console on{' '}
                    <a href="https://www.naukri.com/mnjuser/homepage" target="_blank" rel="noopener noreferrer">naukri.com</a>{' '}
                    while logged into your <strong>{activeProfile.label}</strong> profile. It'll ask you
                    to paste a "Copy as fetch" of the <code>jobapi/v3/search</code> network request for auth.
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
      <ToastStack toasts={toasts} dismiss={dismiss} />
    </main>
  );
}
