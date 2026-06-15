import { useState } from 'react';
import { useAuth } from '../auth';

const FEATURES = [
  {
    icon: '🎯',
    title: 'One radar, every ATS',
    body: 'Greenhouse, Lever, Workday, Ashby, Eightfold — 800+ companies polled every 2 hours.',
  },
  {
    icon: '⚡',
    title: 'Smart-scored matches',
    body: 'Roles ranked for React / frontend / 0–2 yrs by default. Cut signal from noise instantly.',
  },
  {
    icon: '🔥',
    title: 'Streaks & leaderboard',
    body: 'Hit your daily-apply goal, climb the board, keep momentum where job hunts usually die.',
  },
];

export default function AuthScreen() {
  const { login, signup } = useAuth();
  const [mode, setMode]     = useState('login'); // 'login' | 'signup'
  const [email, setEmail]   = useState('');
  const [name, setName]     = useState('');
  const [pw, setPw]         = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      if (mode === 'login') await login(email, pw);
      else                  await signup(email, name, pw);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-mesh" aria-hidden="true">
        <div className="mesh-blob mesh-blob-1" />
        <div className="mesh-blob mesh-blob-2" />
        <div className="mesh-blob mesh-blob-3" />
        <div className="mesh-grid" />
      </div>

      <div className="auth-shell">
        {/* ── Marketing side ── */}
        <aside className="auth-aside">
          <div className="auth-aside-brand">
            <span className="logo-text">HIRE·RADAR</span>
            <span className="auth-aside-tag">
              <span className="live-dot" />
              Tracking 800+ companies · refreshing every 2h
            </span>
          </div>

          <h1 className="auth-aside-title">
            Stop refreshing job boards.<br />
            <span className="auth-aside-gradient">Start landing interviews.</span>
          </h1>

          <ul className="auth-features">
            {FEATURES.map(f => (
              <li key={f.title} className="auth-feature">
                <span className="auth-feature-icon">{f.icon}</span>
                <div>
                  <div className="auth-feature-title">{f.title}</div>
                  <div className="auth-feature-body">{f.body}</div>
                </div>
              </li>
            ))}
          </ul>

          <div className="auth-aside-foot">
            <span className="auth-aside-foot-dot" /> Built by Utkarsh · MERN
          </div>
        </aside>

        {/* ── Auth card ── */}
        <div className="auth-card">
          <div className="auth-brand auth-brand-compact">
            <span className="logo-text">HIRE·RADAR</span>
          </div>

          <h2 className="auth-headline">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="auth-subline">
            {mode === 'login'
              ? 'Pick up your streak right where you left off.'
              : 'Free forever — no card, no spam, just openings.'}
          </p>

          <div className="auth-tabs">
            <button
              className={`auth-tab${mode === 'login' ? ' active' : ''}`}
              onClick={() => setMode('login')}
              type="button"
            >Log in</button>
            <button
              className={`auth-tab${mode === 'signup' ? ' active' : ''}`}
              onClick={() => setMode('signup')}
              type="button"
            >Sign up</button>
          </div>

          <form onSubmit={submit} className="auth-form">
            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </label>

            {mode === 'signup' && (
              <label className="auth-field">
                <span>Display name</span>
                <input
                  type="text"
                  autoComplete="name"
                  placeholder="How you appear on the leaderboard"
                  required
                  minLength={2}
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </label>
            )}

            <label className="auth-field">
              <span>Password</span>
              <div className="auth-pw">
                <input
                  type={showPw ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
                  required
                  minLength={6}
                  value={pw}
                  onChange={e => setPw(e.target.value)}
                />
                <button
                  type="button"
                  className="auth-pw-toggle"
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            {err && <p className="auth-error" role="alert">{err}</p>}

            <button className="auth-submit" disabled={busy} type="submit">
              {busy
                ? <span className="auth-spin" />
                : mode === 'login' ? 'Log in to HireRadar' : 'Create my account'}
            </button>
          </form>

          <p className="auth-foot">
            {mode === 'login'
              ? <>New here? <button className="auth-link" onClick={() => setMode('signup')}>Create an account →</button></>
              : <>Already registered? <button className="auth-link" onClick={() => setMode('login')}>Log in instead →</button></>
            }
          </p>

          <p className="auth-fineprint">
            By continuing you agree to track only your own applications. We don't email you — promise.
          </p>
        </div>
      </div>
    </div>
  );
}
