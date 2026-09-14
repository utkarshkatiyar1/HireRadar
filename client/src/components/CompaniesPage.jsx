import { useState, useEffect, useMemo } from 'react';
import { authFetch } from '../auth';

const ATS_META = {
  greenhouse:      { label: 'Greenhouse',      color: 'var(--ats-greenhouse)',      bg: 'var(--ats-greenhouse-bg)'      },
  lever:           { label: 'Lever',           color: 'var(--ats-lever)',           bg: 'var(--ats-lever-bg)'           },
  workday:         { label: 'Workday',         color: 'var(--ats-workday)',         bg: 'var(--ats-workday-bg)'         },
  ashby:           { label: 'Ashby',           color: 'var(--ats-ashby)',           bg: 'var(--ats-ashby-bg)'           },
  eightfold:       { label: 'Eightfold',       color: 'var(--ats-eightfold)',       bg: 'var(--ats-eightfold-bg)'       },
  smartrecruiters: { label: 'SmartRecruiters', color: 'var(--ats-smartrecruiters)', bg: 'var(--ats-smartrecruiters-bg)' },
  'taleo-ssr':     { label: 'Taleo',           color: 'var(--ats-taleo)',           bg: 'var(--ats-taleo-bg)'           },
  zohorecruit:     { label: 'ZohoRecruit',     color: 'var(--ats-zohorecruit)',     bg: 'var(--ats-zohorecruit-bg)'     },
  'custom-api':    { label: 'Custom',          color: 'var(--ats-custom)',          bg: 'var(--ats-custom-bg)'          },
  playwright:      { label: 'Custom',          color: 'var(--ats-custom)',          bg: 'var(--ats-custom-bg)'          },
};

const meta = (ats) => ATS_META[ats] ?? { label: ats, color: 'var(--ats-custom)', bg: 'var(--ats-custom-bg)' };

const exportSources = (sources) => {
  const seen = new Set();
  const text = sources
    .map(s => s.company)
    .filter(name => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort()
    .join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'hirераdar-companies.txt';
  a.click();
  URL.revokeObjectURL(url);
};

export default function CompaniesPage({ isAdmin = false }) {
  const [sources, setSources]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState(null);
  const [search, setSearch]     = useState('');
  const [atsFilter, setAtsFilter] = useState('all');

  const load = () => {
    setLoading(true); setErr(null);
    authFetch('/jobs/sources')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => { setSources(data); setLoading(false); })
      .catch(e => { setErr(e.message); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const atsList = useMemo(() => {
    const seen = new Set();
    sources.forEach(s => seen.add(s.ats));
    return [...seen].sort();
  }, [sources]);

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sources
      .filter(s => atsFilter === 'all' || s.ats === atsFilter)
      .filter(s => !q || s.company.toLowerCase().includes(q))
      .sort((a, b) => a.company.localeCompare(b.company));
  }, [sources, atsFilter, search]);

  if (loading) return (
    <div className="loading-pulse" style={{ padding: '32px 0' }}>
      <div className="skeleton-row" />
      <div className="skeleton-row" />
      <div className="skeleton-row" />
    </div>
  );
  if (err) return (
    <div className="err-state">
      <p className="msg error">Failed to load companies — {err}</p>
      <button className="page-btn" onClick={load}>Try again</button>
    </div>
  );

  return (
    <div className="cp-page">

      {/* ── Controls ── */}
      <div className="cp-controls">
        <div className="cp-ats-tabs">
          <button
            className={`cp-ats-tab${atsFilter === 'all' ? ' active' : ''}`}
            onClick={() => setAtsFilter('all')}
          >
            All
            <span className="cp-tab-count">{sources.length}</span>
          </button>
          {atsList.map(ats => {
            const m = meta(ats);
            const n = sources.filter(s => s.ats === ats).length;
            return (
              <button
                key={ats}
                className={`cp-ats-tab${atsFilter === ats ? ' active' : ''}`}
                style={atsFilter === ats
                  ? { '--tab-color': m.color, '--tab-bg': m.bg }
                  : {}
                }
                onClick={() => setAtsFilter(ats)}
              >
                <span className="cp-tab-dot" style={{ background: m.color }} />
                {m.label}
                <span className="cp-tab-count">{n}</span>
              </button>
            );
          })}
        </div>
        <input
          className="cp-search"
          type="search"
          placeholder="Search company…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {isAdmin && (
          <button className="cp-export-btn" onClick={() => exportSources(sources)} title="Export all company names as text">
            Export
          </button>
        )}
      </div>

      {/* ── Result count ── */}
      <p className="cp-result-count">
        {displayed.length} {displayed.length === 1 ? 'company' : 'companies'}
      </p>

      {/* ── Card grid ── */}
      <div className="cp-grid">
        {displayed.map(({ company, ats }) => {
          const m = meta(ats);
          return (
            <div key={company} className="cp-card">
              <div className="cp-avatar" style={{ background: m.bg, color: m.color }}>
                {company[0].toUpperCase()}
              </div>
              <div className="cp-card-body">
                <span className="cp-company-name">{company}</span>
                <span className="cp-ats-badge" style={{ color: m.color, background: m.bg }}>
                  {m.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {displayed.length === 0 && (
        <div className="empty">
          <div className="empty-icon">🔍</div>
          <p className="empty-title">No companies match</p>
        </div>
      )}
    </div>
  );
}
