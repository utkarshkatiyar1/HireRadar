import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { authFetch, useAuth } from '../auth';
import ActionRequiredResolver from '../components/ActionRequiredResolver';

// Mirrors server/src/utils/logger.js's ADMIN_EMAIL — purely a UI convenience
// to decide whether to show the Retry button at all; the real enforcement is
// server-side (routes/admin.js's requireAdmin checks the JWT itself, this
// check being wrong either way changes nothing about what the button can
// actually do).
const ADMIN_EMAIL = 'utkarshkatiyar688@gmail.com';

// Statuses routes/admin.js's POST /admin/applications/:id/retry accepts —
// kept here so the button only renders where it would actually succeed.
const ADMIN_RETRYABLE_STATUSES = new Set(['APPLYING', 'SUBMISSION_UNCONFIRMED', 'REJECTED', 'FAILED']);

const TIER_COLOR = { AUTO: '#22c55e', QUICK_APPROVE: '#2dd4bf', DRAFT_ONLY: '#f97316', MANUAL: '#f87171', REVIEWED_MANUAL: '#a78bfa' };
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
  APPROVED: 'Approved. If you approved as a draft, click Submit below when ready — nothing submits automatically from here.',
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
  const { user } = useAuth();
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [retryErr, setRetryErr] = useState(null);

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

  // Distinct from reprepare — reprepare reuses the existing formInspection
  // snapshot (fine when only your Candidate Profile changed); this forces a
  // real re-inspection of the form itself, needed when a bad field is baked
  // into that snapshot (e.g. a site-search widget or CAPTCHA field
  // mis-extracted as a real question).
  const reinspect = async () => {
    setBusy(true);
    try {
      await authFetch(`/applications/${id}/reinspect`, { method: 'POST' });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const reprepare = async () => {
    setBusy(true);
    try {
      await authFetch(`/applications/${id}/reprepare`, { method: 'POST' });
      await load();
    } finally {
      setBusy(false);
    }
  };

  // For an APPROVED application not auto-chained via approve{submit:true}
  // (i.e. you clicked "Approve Draft") — hits the same route the
  // Approve & Submit flow uses internally, just as its own explicit step.
  const submitApplication = async () => {
    setBusy(true);
    try {
      await authFetch(`/applications/${id}/submit`, { method: 'POST' });
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

  // Approve & Next — makes reviewing many applications in a row fast without
  // ever skipping the look: each one still gets approved individually here,
  // this just removes the extra "go back to the list, find the next one,
  // click it" round-trip between reviews. Fetches the next
  // READY_FOR_APPROVAL/DRY_RUN_COMPLETED application (excluding this one) and
  // navigates straight to it; falls back to the queue list if none remain.
  const approveAndNext = async (submit) => {
    setBusy(true);
    try {
      const res = await authFetch(`/applications/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submit }),
      });
      if (!res.ok) return;

      const nextRes = await authFetch('/applications?status=READY_FOR_APPROVAL,DRY_RUN_COMPLETED&sort=best_match&limit=2');
      const nextData = await nextRes.json();
      const next = (nextData.applications || []).find(a => a._id !== id);
      navigate(next ? `/applications/${next._id}` : '/applications');
    } finally {
      setBusy(false);
    }
  };

  // Admin-only unstick for a genuinely stuck APPLYING/SUBMISSION_UNCONFIRMED/
  // REJECTED/FAILED application — hits routes/admin.js's retry route, which
  // trusts the caller to have already confirmed (outside this tool — check
  // the target site or your email) that the original attempt did NOT
  // actually submit before retrying, since retrying an attempt that silently
  // succeeded risks a real double-application.
  const adminRetry = async () => {
    setBusy(true);
    setRetryErr(null);
    try {
      const res = await authFetch(`/admin/applications/${id}/retry`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Retry failed');
      setApp(data);
    } catch (e) {
      setRetryErr(e.message);
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

        {/* Possible-duplicate warning — flagged at discovery time when
            another scraped posting (different url, e.g. the company's own
            careers page vs. its Greenhouse mirror) with the same company +
            title + location already has an application from you. Advisory
            only — never auto-skipped, since two different roles can share a
            title/location. */}
        {app.possibleDuplicateOf && (
          <div className="aq-section" style={{ borderColor: '#f9731640', background: '#f9731612' }}>
            <div className="aq-section-title" style={{ color: '#f97316' }}>
              Possible duplicate
            </div>
            <div style={{ fontSize: '0.9em', opacity: 0.85 }}>
              This looks like the same role (same company, title, and location) as another posting you already have an application for. If it's really the same job, skip one of them to avoid applying twice.
            </div>
          </div>
        )}

        {/* Unresolved-label fields warning — these were excluded from drafting
            entirely (see agents/pipeline.js) because form-inspector couldn't
            find any real question text for them, not because nothing matched
            the candidate's profile. A reviewer needs to know they exist at
            all, since otherwise the form silently has fewer answered fields
            than it actually contains. */}
        {app.formInspection?.fields?.some(f => f.unresolvedLabel) && (
          <div className="aq-section" style={{ borderColor: '#f9731640', background: '#f9731612' }}>
            <div className="aq-section-title" style={{ color: '#f97316' }}>
              {app.formInspection.fields.filter(f => f.unresolvedLabel).length} field(s) on this form couldn't be identified
            </div>
            <div style={{ fontSize: '0.9em', opacity: 0.85 }}>
              These were left out of drafting entirely — check the pre-submit screenshot in the audit trail before approving, in case one of them is a real question.
            </div>
          </div>
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
                <button className="btn-mark" onClick={() => approveAndNext(false)} disabled={busy} title="Approve as a draft, then jump straight to the next application needing review">
                  Approve &amp; Next →
                </button>
                <button className="btn-mark" onClick={reprepare} disabled={busy} title="Re-run answer drafting — useful after updating your Candidate Profile">
                  Reprepare
                </button>
                <button className="btn-mark" onClick={reinspect} disabled={busy} title="Force a fresh look at the actual form — use this if a field looks wrong/fake (e.g. a search box or CAPTCHA field), since Reprepare alone won't fix that.">
                  Re-inspect Form
                </button>
              </>
            )
          )}
          {app.status === 'DRY_RUN_COMPLETED' && (
            <>
              <button className="btn-apply" onClick={() => approve(true)} disabled={busy}>Approve &amp; Submit (Live)</button>
              <button className="btn-mark" onClick={() => approveAndNext(true)} disabled={busy} title="Approve & submit live, then jump straight to the next application needing review">
                Approve &amp; Next →
              </button>
              <button className="btn-mark" onClick={reinspect} disabled={busy} title="Force a fresh look at the actual form">
                Re-inspect Form
              </button>
            </>
          )}
          {/* A real dead end previously: approving as a draft (submit:false)
              landed here with NO action buttons at all except Skip — there
              was no way to ever actually submit a drafted-but-not-yet-
              submitted application. POST /applications/:id/submit already
              existed and worked; nothing in the UI called it. */}
          {app.status === 'APPROVED' && (
            <button className="btn-apply" onClick={submitApplication} disabled={busy}>Submit</button>
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
          {user?.email === ADMIN_EMAIL && ADMIN_RETRYABLE_STATUSES.has(app.status) && (
            <button
              className="btn-mark"
              onClick={adminRetry}
              disabled={busy}
              title="Before retrying: check the target site or your email to confirm the original attempt did NOT actually submit — retrying one that silently succeeded risks a real double-application."
            >
              Retry (admin)
            </button>
          )}
        </div>
        {retryErr && <p className="msg error">{retryErr}</p>}
      </div>
    </main>
  );
}
