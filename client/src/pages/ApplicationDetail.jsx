import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { authFetch } from '../auth';
import ActionRequiredResolver from '../components/ActionRequiredResolver';

const TIER_COLOR = { AUTO: '#22c55e', QUICK_APPROVE: '#2dd4bf', DRAFT_ONLY: '#f97316', MANUAL: '#f87171' };
const VERIFIER_COLOR = { ok: '#22c55e', unsupported: '#f87171', needs_review: '#f97316' };

// Plain-language explanation of what's actually happening at each status —
// the raw enum name (e.g. "EVALUATING") doesn't tell a reader whether it's
// something automatic they should just wait on, or something waiting on them.
const STATUS_EXPLANATION = {
  DISCOVERED: 'Just found by the scraper — waiting to be scored against your profile.',
  EVALUATING: 'Running eligibility and fit-scoring right now. This is automatic — no action needed.',
  READY_FOR_PREPARATION: 'Passed eligibility and fit-scoring. This is a recommendation — prepare it to draft real answers, or skip it.',
  INSPECTING_FORM: 'Opening the application form to detect its fields and platform. Automatic — no action needed.',
  PREPARING: 'Drafting answers from your Candidate Profile and verifying each one. Automatic — no action needed.',
  READY_FOR_APPROVAL: 'Answers are drafted and verified. Review them below, then approve as a draft or approve & submit.',
  APPROVED: 'Approved — about to be handed to the submission worker.',
  APPLYING: 'Submitting the application right now. Automatic — no action needed.',
  ACTION_REQUIRED: 'Submission paused — it needs your input to continue (see below).',
  DRY_RUN_COMPLETED: 'Dry run finished — the form was filled but not actually submitted. Review it, then re-approve to submit for real.',
  SUBMITTED: 'Submitted and confirmed. Nothing more to do here.',
  SUBMISSION_UNCONFIRMED: 'The submit button was clicked, but confirmation couldn\'t be verified. Check the audit trail and confirm manually with the employer if needed.',
  SUBMISSION_BLOCKED: 'Submission was blocked — either no adapter exists for this platform, or live submission isn\'t enabled for it yet.',
  REJECTED: 'Rejected automatically by eligibility or fit-scoring — see the reasons below.',
  SKIPPED: 'You passed on this one.',
  CANCELLED: 'Cancelled.',
  EXPIRED: 'This posting is no longer open — it was likely taken down after being scraped.',
  FAILED: 'Something went wrong in the pipeline. An admin retry is needed to move it forward again.',
};

// Dot color per reached status — green for real progress, red for anything
// that stopped the pipeline, orange for "needs you", grey for neutral/
// terminal-by-choice. Statuses not listed fall back to neutral grey.
const HISTORY_DOT_COLOR = {
  REJECTED: '#f87171', FAILED: '#f87171', SUBMISSION_BLOCKED: '#f87171', SUBMISSION_UNCONFIRMED: '#f87171', EXPIRED: '#f87171',
  ACTION_REQUIRED: '#f97316',
  SKIPPED: '#94a3b8', CANCELLED: '#94a3b8',
  SUBMITTED: '#22c55e', DRY_RUN_COMPLETED: '#22c55e', APPROVED: '#22c55e',
};
const DEFAULT_DOT_COLOR = 'var(--violet)';

const fmtDate = (d) => {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  } catch { return null; }
};

const fmtDateTime = (d) => {
  if (!d) return null;
  try { return new Date(d).toLocaleString(); } catch { return null; }
};

const DESCRIPTION_COLLAPSE_LENGTH = 600;

export default function ApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

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

  return (
    <main>
      <Link to="/applications" className="page-btn" style={{ marginBottom: 16, display: 'inline-block' }}>← Back to Applications</Link>

      <div className="aq-detail">
        <div className="aq-detail-header">
          <div>
            <h1 className="aq-detail-title">{app.job?.title}</h1>
            <div className="aq-row-sub">{app.job?.company} · {app.job?.location}</div>
            <div className="jc-meta" style={{ marginTop: 10 }}>
              {app.job?.exp && (
                <span className="jc-meta-tag">
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                    <rect x="1.5" y="3.5" width="9" height="7" rx="1"/>
                    <path d="M4 3.5V2.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1"/>
                    <path d="M1.5 6.5h9" strokeWidth="1"/>
                  </svg>
                  {app.job.exp}
                </span>
              )}
              {fmtDate(app.job?.postedAt || app.job?.date) && (
                <span className="jc-meta-tag">
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                    <rect x="1.5" y="2" width="9" height="9" rx="1"/>
                    <path d="M8 1v2M4 1v2M1.5 5h9" strokeWidth="1"/>
                  </svg>
                  Posted {fmtDate(app.job?.postedAt || app.job?.date)}
                </span>
              )}
              {app.job?.url && (
                <a href={app.job.url} target="_blank" rel="noopener noreferrer" className="jc-meta-tag" style={{ color: 'var(--violet)' }}>
                  View posting ↗
                </a>
              )}
            </div>
          </div>
          {app.fitScore?.total != null && <span className="aq-score aq-score-lg">{app.fitScore.total}%</span>}
        </div>

        {/* Real history log — every actual statusHistory transition, in
            order, with its own timestamp and note (the pipeline already
            writes rich context here, e.g. "fitScore 10 below policy
            minimumScore 65" — previously captured but never shown anywhere).
            Replaces a fixed happy-path step list that had no way to
            represent REJECTED/ACTION_REQUIRED/etc., hid timestamps behind
            hover-only tooltips, and silently dropped re-entered statuses
            (e.g. an admin retry from REJECTED back to EVALUATING). */}
        {app.statusHistory?.length > 0 && (
          <div className="aq-history">
            {[...app.statusHistory].reverse().map((h, i) => {
              const isCurrent = i === 0;
              const dotColor = HISTORY_DOT_COLOR[h.status] || DEFAULT_DOT_COLOR;
              return (
                <div key={h._id || i} className={`aq-history-entry${isCurrent ? ' current' : ''}`}>
                  <div className="aq-history-rail">
                    <span className="aq-history-dot" style={{ background: dotColor, boxShadow: isCurrent ? `0 0 0 3px ${dotColor}33` : 'none' }} />
                    {i < app.statusHistory.length - 1 && <span className="aq-history-line" />}
                  </div>
                  <div className="aq-history-body">
                    <div className="aq-history-top">
                      <span className="aq-history-status">{h.status.replace(/_/g, ' ')}</span>
                      <span className="aq-history-time">{fmtDateTime(h.at)}</span>
                    </div>
                    <p className="aq-history-note">{h.note || STATUS_EXPLANATION[h.status] || ''}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {STATUS_EXPLANATION[app.status] && (
          <p className="aq-row-sub" style={{ marginTop: -8 }}>{STATUS_EXPLANATION[app.status]}</p>
        )}

        {/* Job description — collapsed by default since raw scraped JD text
            can run to several thousand characters. */}
        {app.job?.description && (
          <div className="aq-section">
            <div className="aq-section-title">Job description</div>
            <p className="aq-row-sub" style={{ whiteSpace: 'pre-wrap' }}>
              {descExpanded || app.job.description.length <= DESCRIPTION_COLLAPSE_LENGTH
                ? app.job.description
                : `${app.job.description.slice(0, DESCRIPTION_COLLAPSE_LENGTH)}…`}
            </p>
            {app.job.description.length > DESCRIPTION_COLLAPSE_LENGTH && (
              <button
                onClick={() => setDescExpanded(v => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, alignSelf: 'flex-start', color: 'var(--violet)', fontSize: '0.82rem', fontWeight: 600 }}
              >
                {descExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        )}

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
            app.formInspection?.automationCapability === 'NONE' ? (
              // No fillable fields were found on this form — nothing to
              // auto-submit. The server blocks this too (applyProcessor.js),
              // but telling you upfront saves a click that would just bounce.
              <a className="btn-apply" href={app.job?.url} target="_blank" rel="noopener noreferrer">
                Apply manually on job posting ↗
              </a>
            ) : (
              <>
                <button className="btn-apply" onClick={() => approve(true)} disabled={busy}>Approve &amp; Submit</button>
                <button className="btn-mark" onClick={() => approve(false)} disabled={busy}>Approve Draft</button>
              </>
            )
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
