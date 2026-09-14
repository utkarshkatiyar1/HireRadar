import { useState } from 'react';
import { authFetch } from '../auth';

// Inline expandable panel (no modal pattern exists elsewhere in this codebase
// — TagEditor/save-bar patterns are all inline, stay consistent). Renders
// differently based on the pending question's fieldKey (captcha | login |
// otherwise treated as a free-text question).
export default function ActionRequiredResolver({ application, onResolved }) {
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const pending = application.pendingQuestion;
  if (!pending) return null;

  const isCaptcha = pending.fieldKey === 'captcha';
  const isLogin = pending.fieldKey === 'login';

  const submit = async (value) => {
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch(`/applications/${application._id}/resolve-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: value }),
      });
      if (res.ok) {
        setAnswer('');
        onResolved?.();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to resolve — try again.');
      }
    } catch {
      setError('Network error — try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="aq-action-required">
      <div className="aq-action-required-header">
        <span className="aq-action-icon">{isCaptcha ? '🧩' : isLogin ? '🔐' : '❓'}</span>
        <div>
          <div className="aq-action-title">Your input is required</div>
          <div className="aq-row-sub">{pending.question}</div>
        </div>
      </div>

      {error && <p className="msg error">{error}</p>}

      {isCaptcha && (
        <div className="aq-action-body">
          <p className="aq-row-sub">
            A CAPTCHA on the application form blocked automated submission. Open the job posting, solve it manually, then confirm below.
          </p>
          <div className="aq-action-buttons">
            <a href="#" className="btn-mark" onClick={(e) => e.preventDefault()}>Open Application</a>
            <button className="btn-apply" onClick={() => submit('captcha solved manually')} disabled={busy}>
              {busy ? 'Confirming…' : "I've solved it, continue"}
            </button>
          </div>
        </div>
      )}

      {isLogin && (
        <div className="aq-action-body">
          <p className="aq-row-sub">
            This application requires signing in or creating an account — it can't be filled automatically. Complete it manually on the company's site.
          </p>
          <div className="aq-action-buttons">
            <button className="btn-mark" onClick={() => submit('requires manual login — marked resolved')} disabled={busy}>
              Mark as handled manually
            </button>
          </div>
        </div>
      )}

      {!isCaptcha && !isLogin && (
        <div className="aq-action-body">
          <div className="aq-action-buttons" style={{ marginBottom: 8 }}>
            <input
              className="tag-input"
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              placeholder="Your answer…"
              onKeyDown={e => { if (e.key === 'Enter' && answer.trim()) submit(answer.trim()); }}
            />
          </div>
          <div className="aq-action-buttons">
            <button className="btn-apply" onClick={() => submit(answer.trim())} disabled={busy || !answer.trim()}>
              {busy ? 'Submitting…' : 'Submit answer'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
