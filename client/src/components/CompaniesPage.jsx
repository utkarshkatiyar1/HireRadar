import { useState, useEffect, useMemo } from 'react';
import { authFetch } from '../auth';

const ATS_META = {
  greenhouse:      { label: 'Greenhouse',      color: '#4ade80', bg: 'rgba(74,222,128,0.12)'  },
  lever:           { label: 'Lever',           color: '#fb923c', bg: 'rgba(251,146,60,0.12)'  },
  workday:         { label: 'Workday',         color: '#60a5fa', bg: 'rgba(96,165,250,0.12)'  },
  ashby:           { label: 'Ashby',           color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  eightfold:       { label: 'Eightfold',       color: '#f472b6', bg: 'rgba(244,114,182,0.12)' },
  smartrecruiters: { label: 'SmartRecruiters', color: '#2dd4bf', bg: 'rgba(45,212,191,0.12)'  },
  'taleo-ssr':     { label: 'Taleo',           color: '#fbbf24', bg: 'rgba(251,191,36,0.12)'  },
  zohorecruit:     { label: 'ZohoRecruit',     color: '#e8622a', bg: 'rgba(232,98,42,0.12)'   },
  'custom-api':    { label: 'Custom',          color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
  playwright:      { label: 'Custom',          color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
};

const meta = (ats) => ATS_META[ats] ?? { label: ats, color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' };

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
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [atsFilter, setAtsFilter] = useState('all');

  useEffect(() => {
    authFetch('/jobs/sources')
      .then(r => r.json())
      .then(data => { setSources(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

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

  if (loading) return <p className="msg">Loading sources…</p>;

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
