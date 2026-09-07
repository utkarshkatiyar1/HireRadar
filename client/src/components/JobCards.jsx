import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const DAY_MS = 86_400_000;

const fmt = (d) => {
  try {
    return new Date(d).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
  } catch { return '–'; }
};

const fmtRel = (d) => {
  if (!d) return null;
  const s = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const isNew = (firstSeen) => firstSeen && (Date.now() - new Date(firstSeen).getTime()) < DAY_MS;

const PALETTES = [
  ['#6366f1','#4f46e5'], ['#8b5cf6','#7c3aed'], ['#ec4899','#db2777'],
  ['#f43f5e','#e11d48'], ['#f97316','#ea580c'], ['#22c55e','#16a34a'],
  ['#14b8a6','#0d9488'], ['#0ea5e9','#0284c7'], ['#a78bfa','#7c3aed'],
  ['#fb923c','#ea580c'],
];

const ATS_COLORS = {
  workday:    '#3b82f6',
  greenhouse: '#22c55e',
  lever:      '#f97316',
  eightfold:  '#a78bfa',
  custom:     '#64748b',
};

function seedPalette(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = Math.imul(31, h) + name.charCodeAt(i) | 0;
  return PALETTES[Math.abs(h) % PALETTES.length];
}

function companyInitials(name) {
  const parts = name.split(/[\s\-]+/).filter(Boolean);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

const liSlug = (n) => n.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

export default function JobCards({ jobs, onMarkApplied, onDismiss }) {
  const [dismissing, setDismissing] = useState(new Set());
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const handleDismiss = (id) => {
    setDismissing(prev => new Set(prev).add(id));
    setTimeout(() => onDismiss(id), 260);
  };

  if (!jobs.length) {
    return (
      <div className="empty">
        <div className="empty-icon">📡</div>
        <p className="empty-title">No jobs match your filters.</p>
        <code>node src/index.js</code>
        <p className="empty-hint">Run the scraper to fetch jobs, or adjust your filters above.</p>
      </div>
    );
  }

  return (
    <div className="jc-grid">
      {jobs.map((j, i) => {
        const [c1, c2] = seedPalette(j.company);
        const ac = ATS_COLORS[j.ats] ?? ATS_COLORS.custom;
        const atsLabel = j.ats ? j.ats.charAt(0).toUpperCase() + j.ats.slice(1) : 'Custom';

        return (
          <div
            key={j._id}
            className={`jc-card${j.applied ? ' jc-applied' : ''}${dismissing.has(j._id) ? ' jc-dismissing' : ''}`}
            style={{ '--ac': ac, animationDelay: `${i * 40}ms` }}
          >
            {/* Company row */}
            <div className="jc-co-row">
              <div
                className="jc-avatar"
                style={{ background: `linear-gradient(140deg, ${c1}, ${c2})` }}
              >
                {companyInitials(j.company)}
                <span className="jc-av-check">✓</span>
              </div>
              <div className="jc-co-body">
                <span className="jc-co-name">{j.company}</span>
                <span className="jc-ats-chip">
                  <span className="jc-ats-dot" />
                  {atsLabel}
                </span>
              </div>
              <div className="jc-co-right">
                {isNew(j.firstSeen) && !j.applied && (
                  <span className="badge-new">NEW</span>
                )}
                {!j.applied && (
                  <button
                    className="jc-dismiss"
                    onClick={() => handleDismiss(j._id)}
                    title="Hide this job"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Title */}
            <h3 className="jc-title">
              <Link to={`/jobs/${j._id}`} className="jc-title-link">{j.title}</Link>
            </h3>

            {/* Meta */}
            <div className="jc-meta">
              {j.location && (
                <span className="jc-meta-tag">
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                    <path d="M6 1C4.07 1 2.5 2.57 2.5 4.5c0 2.63 3.5 6.5 3.5 6.5s3.5-3.87 3.5-6.5C9.5 2.57 7.93 1 6 1z"/>
                    <circle cx="6" cy="4.5" r="1.2" fill="currentColor" stroke="none"/>
                  </svg>
                  {j.location}
                </span>
              )}
              {j.exp && (
                <span className="jc-meta-tag">
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                    <rect x="1.5" y="3.5" width="9" height="7" rx="1"/>
                    <path d="M4 3.5V2.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1"/>
                    <path d="M1.5 6.5h9" strokeWidth="1"/>
                  </svg>
                  {j.exp}
                </span>
              )}
              {j.date && (
                <span className="jc-meta-tag">
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                    <rect x="1.5" y="2" width="9" height="9" rx="1"/>
                    <path d="M8 1v2M4 1v2M1.5 5h9" strokeWidth="1"/>
                  </svg>
                  {fmt(j.date)}
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="jc-actions">
              {j.applied ? (
                <>
                  <span className="badge-applied">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Applied {fmtRel(j.appliedAt) || ''}
                  </span>
                  <a
                    href={j.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="jc-btn-view"
                  >
                    View posting
                  </a>
                </>
              ) : (
                <>
                  <a
                    href={j.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-apply"
                  >
                    Apply
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M2.5 6h7M7 3.5l2.5 2.5L7 8.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </a>
                  <a
                    href={`https://www.linkedin.com/company/${liSlug(j.company)}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-referral"
                    title={`Find ${j.company} connections on LinkedIn`}
                  >
                    Referral
                  </a>
                  <button
                    className="btn-mark"
                    onClick={() => onMarkApplied(j._id)}
                  >
                    Mark Applied
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
