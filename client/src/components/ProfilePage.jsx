import { useState, useEffect } from 'react';
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

  const add = () => {
    const v = input.trim().toLowerCase();
    if (!v || tags.includes(v)) { setInput(''); return; }
    onChange([...tags, v]);
    setInput('');
  };

  const remove = (tag) => onChange(tags.filter(t => t !== tag));

  return (
    <div className="tag-editor">
      <div className="tag-list">
        {tags.map(tag => (
          <span key={tag} className="tag-pill" style={{ '--pill-color': color }}>
            {tag}
            <button className="tag-remove" onClick={() => remove(tag)} title="Remove">×</button>
          </span>
        ))}
      </div>
      <div className="tag-input-row">
        <input
          className="tag-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
        />
        <button className="tag-add-btn" onClick={add}>Add</button>
      </div>
    </div>
  );
}

const SECTIONS = [
  {
    key: 'locationAllow',
    icon: '📍',
    title: 'Location Allowlist',
    desc: 'Jobs must match at least one of these locations. Empty = all locations pass.',
    color: '#60a5fa',
    placeholder: 'e.g. pune, remote…',
  },
  {
    key: 'seniorityExclude',
    icon: '🚫',
    title: 'Title Exclusions',
    desc: 'Jobs with these words in the title are hard-dropped regardless of score.',
    color: '#f87171',
    placeholder: 'e.g. senior, manager…',
  },
  {
    key: 'frontendSignals',
    icon: '⚡',
    title: 'Boost Keywords',
    badge: '+3 pts each',
    desc: 'Matching jobs get ranked higher. Add tech stack you want to see.',
    color: '#4ade80',
    placeholder: 'e.g. react, typescript…',
  },
  {
    key: 'juniorSignals',
    icon: '🌱',
    title: 'Junior Signals',
    badge: '+2 pts each',
    desc: 'Entry-level and new-grad keywords that bump these roles up.',
    color: '#a78bfa',
    placeholder: 'e.g. junior, entry level…',
  },
  {
    key: 'negativeSignals',
    icon: '⬇️',
    title: 'Suppress Keywords',
    badge: '−3 pts each',
    desc: 'Jobs matching these are penalised — fall below threshold and disappear.',
    color: '#fb923c',
    placeholder: 'e.g. backend, devops…',
  },
];

export default function ProfilePage({ user }) {
  const { logout } = useAuth();
  const [prefs, setPrefs]   = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState(null);

  useEffect(() => {
    authFetch('/profile')
      .then(r => r.json())
      .then(data => setPrefs(data.prefs))
      .catch(() => setPrefs({ ...DEFAULTS }));
  }, []);

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

      {/* User card */}
      <div className="profile-user-card">
        <div className="profile-avatar">
          {(user?.name || '?')[0].toUpperCase()}
        </div>
        <div className="profile-user-info">
          <div className="profile-name">{user?.name}</div>
          <div className="profile-email">{user?.email}</div>
        </div>
      </div>

      <div className="profile-divider" />
      <p className="profile-intro">
        Smart Filter uses these rules to rank and filter jobs. Changes apply the next time jobs load.
      </p>

      {/* Filter sections */}
      {SECTIONS.map(({ key, icon, title, badge, desc, color, placeholder }) => (
        <div className="profile-section" key={key}>
          <div className="profile-section-header">
            <span className="profile-section-icon">{icon}</span>
            <div className="profile-section-meta">
              <div className="profile-section-title">
                {title}
                {badge && <span className="profile-badge" style={{ color }}>{badge}</span>}
              </div>
              <div className="profile-section-desc">{desc}</div>
            </div>
          </div>
          <TagEditor
            tags={prefs[key] ?? []}
            onChange={set(key)}
            color={color}
            placeholder={placeholder}
          />
        </div>
      ))}

      {/* Score threshold */}
      <div className="profile-section">
        <div className="profile-section-header">
          <span className="profile-section-icon">🎯</span>
          <div className="profile-section-meta">
            <div className="profile-section-title">Score Threshold</div>
            <div className="profile-section-desc">
              Jobs scoring below this are hidden when Smart Filter is ON. Default 0.
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
              ? 'All non-excluded jobs shown'
              : `Only jobs scoring ≥ ${prefs.scoreThreshold} shown`}
          </span>
        </div>
      </div>

      {/* Actions */}
      {error && <p className="profile-error">{error}</p>}
      <div className="profile-actions">
        <button className="profile-logout-btn" onClick={logout}>
          Log out
        </button>
        <div className="profile-actions-right">
          <button className="profile-reset-btn" onClick={reset}>
            Reset to Defaults
          </button>
          <button
            className={`profile-save-btn${saved ? ' saved' : ''}`}
            onClick={save}
            disabled={saving}
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
