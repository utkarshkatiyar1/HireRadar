import { useState, useEffect, useRef } from 'react';
import { authFetch, useAuth } from '../auth';

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
    'html', 'css', 'browser', 'dom', 'vite', 'webpack', 'spa',
  ],
  juniorSignals: [
    'junior', 'jr ', 'entry level', 'entry-level', 'new grad',
    'fresh', 'associate engineer', 'associate developer', 'associate sde',
    'early career', 'graduate',
    'sde i', 'sde-i', 'sde1', 'engineer i', 'engineer-i',
    'sde ii', 'sde-ii', 'sde2', 'engineer ii', 'engineer-ii',
    'level 3', 'level 4', 'l3', 'l4',
    'mid level', 'mid-level', 'midlevel',
    'product engineer', 'application engineer', 'ui platform', 'web platform',
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

function TagEditor({ tags, onChange, color, placeholder }) {
  const [input, setInput] = useState('');
  const inputRef = useRef(null);

  const add = () => {
    const v = input.trim().toLowerCase();
    if (!v || tags.includes(v)) { setInput(''); return; }
    onChange([...tags, v]);
    setInput('');
    inputRef.current?.focus();
  };

  const remove = (tag) => onChange(tags.filter(t => t !== tag));

  return (
    <div className="tag-editor">
      {tags.length > 0 && (
        <div className="tag-list-wrap">
          <div className="tag-list">
            {tags.map(tag => (
              <span key={tag} className="tag-pill" style={{ '--pill-color': color }}>
                {tag}
                <button className="tag-remove" onClick={() => remove(tag)} title="Remove">×</button>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="tag-input-row">
        <input
          ref={inputRef}
          className="tag-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
        />
        <button className="tag-add-btn" onClick={add}>Add</button>
        {tags.length > 0 && (
          <button className="tag-clear-btn" onClick={() => onChange([])} title="Clear all">
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}

const SECTIONS = [
  {
    key: 'locationAllow',
    icon: '📍',
    title: 'Location Allowlist',
    badge: null,
    badgeColor: null,
    desc: 'Jobs must contain at least one of these to pass. Empty list = all locations allowed.',
    color: '#60a5fa',
    placeholder: 'Add city or keyword, press Enter…',
  },
  {
    key: 'seniorityExclude',
    icon: '🚫',
    title: 'Title Exclusions',
    badge: 'hard drop',
    badgeColor: '#f87171',
    desc: 'Any job whose title contains one of these is removed before scoring.',
    color: '#f87171',
    placeholder: 'Add title word to block, press Enter…',
  },
  {
    key: 'frontendSignals',
    icon: '⚡',
    title: 'Boost Keywords',
    badge: '+3 pts',
    badgeColor: '#4ade80',
    desc: 'Each match adds 3 points. Use for your target stack.',
    color: '#4ade80',
    placeholder: 'Add tech keyword, press Enter…',
  },
  {
    key: 'juniorSignals',
    icon: '🌱',
    title: 'Junior Signals',
    badge: '+2 pts',
    badgeColor: '#a78bfa',
    desc: 'Each match adds 2 points. Entry-level and new-grad terms.',
    color: '#a78bfa',
    placeholder: 'Add level keyword, press Enter…',
  },
  {
    key: 'negativeSignals',
    icon: '⬇️',
    title: 'Suppress Keywords',
    badge: '−3 pts',
    badgeColor: '#fb923c',
    desc: 'Each match subtracts 3 points. Roles you want pushed down.',
    color: '#fb923c',
    placeholder: 'Add keyword to suppress, press Enter…',
  },
];

export default function ProfilePage({ user }) {
  const { logout } = useAuth();
  const [prefs, setPrefs]       = useState(null);
  const [savedPrefs, setSavedPrefs] = useState(null);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState(null);

  useEffect(() => {
    authFetch('/profile')
      .then(r => r.json())
      .then(data => {
        setPrefs(data.prefs);
        setSavedPrefs(data.prefs);
      })
      .catch(() => {
        setPrefs({ ...DEFAULTS });
        setSavedPrefs({ ...DEFAULTS });
      });
  }, []);

  const isDirty = prefs && savedPrefs &&
    JSON.stringify(prefs) !== JSON.stringify(savedPrefs);

  const set = (key) => (val) => setPrefs(p => ({ ...p, [key]: val }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch('/profile/filters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      if (res.ok) {
        setSavedPrefs(prefs);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError('Failed to save. Try again.');
      }
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => setPrefs({ ...DEFAULTS });

  if (!prefs) return <p className="msg">Loading profile…</p>;

  return (
    <div className="profile-page">

      {/* ── User card ── */}
      <div className="profile-user-card">
        <div className="profile-avatar-lg">
          {(user?.name || '?')[0].toUpperCase()}
        </div>
        <div className="profile-user-info">
          <div className="profile-name">{user?.name}</div>
          <div className="profile-email">{user?.email}</div>
        </div>
        <button className="profile-logout-btn" onClick={logout}>Log out</button>
      </div>

      {/* ── Section label ── */}
      <div className="profile-section-label">
        <span>Smart Filter Rules</span>
        <span className="profile-section-label-sub">
          Controls what jobs appear when Smart Filter is ON · saved per account
        </span>
      </div>

      {/* ── Filter sections ── */}
      {SECTIONS.map(({ key, icon, title, badge, badgeColor, desc, color, placeholder }) => {
        const count = prefs[key]?.length ?? 0;
        return (
          <div className="profile-section" key={key}>
            <div className="profile-section-top">
              <span className="profile-section-icon">{icon}</span>
              <div className="profile-section-meta">
                <div className="profile-section-title">
                  {title}
                  {badge && (
                    <span className="profile-badge" style={{ color: badgeColor, borderColor: `${badgeColor}40`, background: `${badgeColor}12` }}>
                      {badge}
                    </span>
                  )}
                </div>
                <div className="profile-section-desc">{desc}</div>
              </div>
              <span className="profile-tag-count" style={{ color }}>
                {count}
              </span>
            </div>
            <TagEditor
              tags={prefs[key] ?? []}
              onChange={set(key)}
              color={color}
              placeholder={placeholder}
            />
          </div>
        );
      })}

      {/* ── Score threshold ── */}
      <div className="profile-section">
        <div className="profile-section-top">
          <span className="profile-section-icon">🎯</span>
          <div className="profile-section-meta">
            <div className="profile-section-title">Score Threshold</div>
            <div className="profile-section-desc">
              Minimum score for a job to appear with Smart Filter ON.
            </div>
          </div>
        </div>
        <div className="threshold-row">
          <input
            type="number"
            className="threshold-input"
            value={prefs.scoreThreshold ?? 0}
            min="-20"
            max="30"
            onChange={e => set('scoreThreshold')(Number(e.target.value))}
          />
          <span className="threshold-hint">
            {(prefs.scoreThreshold ?? 0) <= 0
              ? 'Showing all non-excluded jobs'
              : `Hiding jobs scoring below ${prefs.scoreThreshold}`}
          </span>
        </div>
      </div>

      {/* ── Sticky save bar ── */}
      <div className={`profile-save-bar${isDirty ? ' dirty' : ''}`}>
        {error && <span className="profile-error">{error}</span>}
        {isDirty && !error && <span className="profile-unsaved">Unsaved changes</span>}
        {!isDirty && !error && <span className="profile-saved-note">{saved ? '✓ Saved' : 'All changes saved'}</span>}
        <div className="profile-save-bar-actions">
          <button className="profile-reset-btn" onClick={reset}>Reset to Defaults</button>
          <button
            className={`profile-save-btn${saved ? ' saved' : ''}`}
            onClick={save}
            disabled={saving || !isDirty}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

    </div>
  );
}
