import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { authFetch } from '../auth';
import ActionRequiredResolver from '../components/ActionRequiredResolver';

const TIER_COLOR = { AUTO: '#22c55e', QUICK_APPROVE: '#2dd4bf', DRAFT_ONLY: '#f97316', MANUAL: '#f87171' };
const VERIFIER_COLOR = { ok: '#22c55e', unsupported: '#f87171', needs_review: '#f97316' };

const STATE_STEPS = [
  'DISCOVERED', 'EVALUATING', 'READY_FOR_PREPARATION', 'INSPECTING_FORM', 'PREPARING',
  'READY_FOR_APPROVAL', 'APPROVED', 'APPLYING', 'SUBMITTED',
];

export default function ApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/applications/${id}`);
      if (!res.ok) throw new Error(res.status === 404 ? 'Application not found' : `HTTP ${res.status}`);
      setApp(await res.json());
      setErr(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const prepare = async () => {
    setBusy(true);
    try {
      await authFetch(`/applications/${id}/prepare`, { method: 'POST' });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const approve = async (submit) => {
    setBusy(true);
    try {
      const res = await authFetch(`/applications/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submit }),
      });
      if (res.ok) setApp(await res.json());
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    setBusy(true);
    try {
      await authFetch(`/applications/${id}/skip`, { method: 'POST' });
      navigate('/applications');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <main><div className="loading-pulse"><div className="skeleton-row" /><div className="skeleton-row" /></div></main>;
  }

  if (err) {
    return (
      <main>
        <div className="err-state">
          <p className="msg error">{err}</p>
          <Link className="page-btn" to="/applications">← Back to Applications</Link>
        </div>
      </main>
    );
  }

  const stepIndex = STATE_STEPS.indexOf(app.status);

  return (
    <main>
      <Link to="/applications" className="page-btn" style={{ marginBottom: 16, display: 'inline-block' }}>← Back to Applications</Link>

      <div className="aq-detail">
        <div className="aq-detail-header">
          <div>
            <h1 className="aq-detail-title">{app.job?.title}</h1>
            <div className="aq-row-sub">{app.job?.company} · {app.job?.location}</div>
          </div>
          {app.fitScore?.total != null && <span className="aq-score aq-score-lg">{app.fitScore.total}%</span>}
        </div>

        {/* State timeline */}
        {stepIndex >= 0 && (
          <div className="aq-timeline">
            {STATE_STEPS.map((s, i) => (
              <div key={s} className={`aq-timeline-step${i <= stepIndex ? ' done' : ''}${i === stepIndex ? ' current' : ''}`}>
                <span className="aq-timeline-dot" />
                <span className="aq-timeline-label">{s.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        )}
        {stepIndex < 0 && <div className="aq-status-badge">{app.status.replace(/_/g, ' ')}</div>}

        {/* Eligibility / fit rationale */}
        {app.eligibility?.reasons?.length > 0 && (
          <div className="aq-section">
            <div className="aq-section-title">Eligibility notes</div>
            <ul className="aq-reasons">{app.eligibility.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
        )}
        {app.fitScore?.rationale && (
          <div className="aq-section">
            <div className="aq-section-title">Fit rationale</div>
            <p className="aq-row-sub">{app.fitScore.rationale}</p>
          </div>
        )}

        {/* Action required */}
        {app.status === 'ACTION_REQUIRED' && (
          <ActionRequiredResolver application={app} onResolved={load} />
        )}

        {/* Answers */}
        {app.answers?.length > 0 && (
          <div className="aq-section">
            <div className="aq-section-title">Generated answers</div>
            <div className="aq-answers">
              {app.answers.map(a => (
                <div className="aq-answer-row" key={a.fieldKey}>
                  <div className="aq-answer-label">{a.fieldLabel || a.fieldKey}</div>
                  <div className="aq-answer-value">{a.value || <em className="aq-answer-blank">left blank — no matching fact</em>}</div>
                  <div className="aq-answer-meta">
                    <span className="aq-confidence">{a.confidence}% confidence</span>
                    {a.verifierFlag && (
                      <span className="aq-verifier" style={{ color: VERIFIER_COLOR[a.verifierFlag] }}>
                        {a.verifierFlag.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Resume + tier */}
        <div className="aq-section aq-meta-row">
          {app.confidenceTier && (
            <span className="aq-tier" style={{ color: TIER_COLOR[app.confidenceTier], borderColor: `${TIER_COLOR[app.confidenceTier]}40`, background: `${TIER_COLOR[app.confidenceTier]}12` }}>
              {app.confidenceTier.replace('_', ' ')}
            </span>
          )}
          {app.applicationPlatform && <span className="jc-ats-chip"><span className="jc-ats-dot" />{app.applicationPlatform}</span>}
        </div>

        {/* Actions */}
        <div className="aq-actions">
          {app.status === 'READY_FOR_PREPARATION' && (
            <button className="btn-apply" onClick={prepare} disabled={busy}>Prepare Application</button>
          )}
          {app.status === 'READY_FOR_APPROVAL' && (
            <>
              <button className="btn-apply" onClick={() => approve(true)} disabled={busy}>Approve &amp; Submit</button>
              <button className="btn-mark" onClick={() => approve(false)} disabled={busy}>Approve Draft</button>
            </>
          )}
          {app.status === 'DRY_RUN_COMPLETED' && (
            <button className="btn-apply" onClick={() => approve(true)} disabled={busy}>Approve &amp; Submit (Live)</button>
          )}
          {app.status === 'SUBMITTED' && (
            <Link className="btn-mark" to={`/audit/${app._id}`}>View Audit Trail</Link>
          )}
          {/* Every status here has an ALLOWED_TRANSITIONS entry (server/src/
              utils/applicationState.js) that does NOT include SKIPPED —
              showing Skip for any of these would 409 on click. */}
          {!['SUBMITTED', 'SKIPPED', 'REJECTED', 'CANCELLED', 'DRY_RUN_COMPLETED', 'EXPIRED', 'SUBMISSION_UNCONFIRMED', 'SUBMISSION_BLOCKED', 'FAILED'].includes(app.status) && (
            <button className="jc-dismiss" onClick={skip} disabled={busy} title="Pass on this role">Skip</button>
          )}
        </div>
      </div>
    </main>
  );
}
