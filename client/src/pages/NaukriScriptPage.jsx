import { useState, useMemo } from 'react';
import { NAUKRI_TEMPLATE, DEFAULT_NAUKRI_CONFIG } from '../config/naukriScriptTemplate';

const STORAGE_KEY = 'hireradar.naukriScript.config.v1';

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

export default function NaukriScriptPage() {
  const [form, setForm] = useState(() => {
    const stored = loadStoredConfig() || DEFAULT_NAUKRI_CONFIG;
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
      searches: stored.searches.join('\n'),
      excludedCompanies: stored.excludedCompanies.join('\n'),
    };
  });
  const [notice, setNotice] = useState('');

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
    searches: linesToArray(form.searches),
    excludedCompanies: linesToArray(form.excludedCompanies),
  }), [form]);

  const script = useMemo(() => generateScript(cfg), [cfg]);

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 2200);
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    flash('✓ Saved locally');
  };

  const handleReset = () => {
    setForm({
      myExperience: String(DEFAULT_NAUKRI_CONFIG.myExperience),
      maxMinimumExperience: String(DEFAULT_NAUKRI_CONFIG.maxMinimumExperience),
      searchExperience: String(DEFAULT_NAUKRI_CONFIG.searchExperience),
      maxActualAgeDays: String(DEFAULT_NAUKRI_CONFIG.maxActualAgeDays),
      minScore: String(DEFAULT_NAUKRI_CONFIG.minScore),
      concurrency: String(DEFAULT_NAUKRI_CONFIG.concurrency),
      pagesPerSearch: String(DEFAULT_NAUKRI_CONFIG.pagesPerSearch),
      resultsPerPage: String(DEFAULT_NAUKRI_CONFIG.resultsPerPage),
      batchDelayMs: String(DEFAULT_NAUKRI_CONFIG.batchDelayMs),
      locations: DEFAULT_NAUKRI_CONFIG.locations.join('\n'),
      searches: DEFAULT_NAUKRI_CONFIG.searches.join('\n'),
      excludedCompanies: DEFAULT_NAUKRI_CONFIG.excludedCompanies.join('\n'),
    });
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
    a.download = 'naukri-power-search.js';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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
                  <div className="profile-section-title">Search keywords</div>
                  <div className="profile-section-desc">One per line. Each becomes a separate Naukri search.</div>
                </div>
              </div>
              <textarea className="cpf-textarea" rows={12} value={form.searches} onChange={set('searches')} />
            </div>

            <div className="profile-section">
              <div className="profile-section-top">
                <span className="profile-section-icon">🚫</span>
                <div className="profile-section-meta">
                  <div className="profile-section-title">Excluded companies</div>
                  <div className="profile-section-desc">One per line. Case-insensitive substring match.</div>
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
                    Paste this into the browser console on{' '}
                    <a href="https://www.naukri.com/mnjuser/homepage" target="_blank" rel="noopener noreferrer">naukri.com</a>{' '}
                    while logged in. It'll ask you to paste a "Copy as fetch" of the{' '}
                    <code>jobapi/v3/search</code> network request for auth.
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
