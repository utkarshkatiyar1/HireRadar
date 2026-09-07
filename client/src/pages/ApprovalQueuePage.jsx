import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApplications } from '../hooks/useApplications';
import { authFetch, useAuth } from '../auth';
import { ADMIN_EMAIL } from '../routes/guards';

// Every status whose ALLOWED_TRANSITIONS entry (server/src/utils/
// applicationState.js) does NOT include SKIPPED — showing a Skip button for
// any of these would 409 on click. Keep this in sync with that file; it's
// the actual source of truth. Matches ApplicationDetail.jsx's own guard.
const SKIPPABLE_EXCLUDE = new Set([
  'SUBMITTED', 'SKIPPED', 'REJECTED', 'CANCELLED',
  'DRY_RUN_COMPLETED', 'EXPIRED', 'SUBMISSION_UNCONFIRMED', 'SUBMISSION_BLOCKED', 'FAILED',
  'APPLIED_MANUALLY',
]);

// Every Needs Action status whose ALLOWED_TRANSITIONS entry (server/src/
// utils/applicationState.js) includes APPLIED_MANUALLY — i.e. every status
// this bucket shows, since all four represent a job the user could just go
// apply to directly on the company's site instead of continuing the
// automated flow. Keep in sync with that file, same as SKIPPABLE_EXCLUDE above.
const MANUAL_APPLY_ELIGIBLE = new Set([
  'READY_FOR_PREPARATION', 'READY_FOR_APPROVAL', 'ACTION_REQUIRED', 'DRY_RUN_COMPLETED',
]);

// Bucketed by "does this need a decision from you right now", not by pipeline
// stage — READY_FOR_PREPARATION (a recommendation waiting on prepare/skip)
// and DRY_RUN_COMPLETED (a dry-run waiting on re-approval to actually submit)
// both require your input, so they belong in Needs Action even though
// they're not "approval" or "action-required" in the literal status-name
// sense. Everything else in In Progress is a transient, fully-automatic
// worker state you never have to look at.
// sort: passed straight through to GET /applications?sort=... (see
// routes/applications.js). Needs Action defaults to best_match — you want to
// review your strongest recommendations first, not just the newest. Every
// other bucket stays chronological (its default, 'recent'), since ordering
// by score doesn't mean much for something you already submitted or that
// the pipeline rejected.
// 'updated_recent' (routes/applications.js) sorts by the APPLICATION's own
// last statusHistory change, not the job's posting date — for Done/Issues
// that's the axis that actually matters (most-recently-submitted, most-
// recently-failed), and unlike a client-side re-sort it's correct across the
// FULL result set before pagination, not just whatever page 'recent' would
// have handed back. A client-side re-sort was tried first and was wrong: it
// can only reorder the page it already fetched, so a job rejected moments
// ago could sit unseen on some later page while stale older ones showed on
// page 1.
const BUCKETS = {
  needsAction: { label: 'Needs Action', statuses: ['READY_FOR_PREPARATION', 'READY_FOR_APPROVAL', 'ACTION_REQUIRED', 'DRY_RUN_COMPLETED'], sort: 'best_match' },
  inProgress:  { label: 'In Progress',  statuses: ['DISCOVERED', 'EVALUATING', 'INSPECTING_FORM', 'PREPARING', 'APPROVED', 'APPLYING'], sort: 'updated_recent' },
  done:        { label: 'Done',         statuses: ['SUBMITTED'], sort: 'updated_recent' },
  issues:      { label: 'Issues',       statuses: ['REJECTED', 'FAILED', 'SUBMISSION_UNCONFIRMED', 'SUBMISSION_BLOCKED', 'EXPIRED'], sort: 'updated_recent' },
};

const TIER_COLOR = {
  AUTO: '#22c55e', QUICK_APPROVE: '#2dd4bf', DRAFT_ONLY: '#f97316', MANUAL: '#f87171', REVIEWED_MANUAL: '#a78bfa',
};

const STATUS_LABEL = {
  DISCOVERED: 'Discovered', EVALUATING: 'Evaluating', REJECTED: 'Rejected', SKIPPED: 'Skipped',
  READY_FOR_PREPARATION: 'Ready to Prepare', INSPECTING_FORM: 'Inspecting Form', PREPARING: 'Preparing',
  READY_FOR_APPROVAL: 'Ready for Approval', APPROVED: 'Approved', APPLYING: 'Applying',
  ACTION_REQUIRED: 'Action Required', DRY_RUN_COMPLETED: 'Dry-Run Completed', SUBMITTED: 'Submitted',
  SUBMISSION_UNCONFIRMED: 'Submission Unconfirmed', SUBMISSION_BLOCKED: 'Submission Blocked',
  CANCELLED: 'Cancelled', EXPIRED: 'Expired', FAILED: 'Failed', APPLIED_MANUALLY: 'Applied Manually',
};

const PAGE_SIZE = 50;

const fmtRel = (d) => {
  if (!d) return null;
  const s = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2_592_000) return `${Math.floor(s / 86400)}d ago`;
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

// The most meaningful "when" for a row: SUBMITTED uses appliedAt specifically
// (set exactly at confirmed submission — see applyProcessor.js), everything
// else uses the most recent statusHistory entry (i.e. when it last actually
// changed state), falling back to updatedAt if history is somehow empty.
const rowTimestamp = (app) => {
  if (app.status === 'SUBMITTED' && app.appliedAt) return app.appliedAt;
  const lastHistory = app.statusHistory?.[app.statusHistory.length - 1];
  return lastHistory?.at || app.updatedAt;
};

// One-click, no-input next-step action per status — lets a row be actioned
// straight from the list instead of opening the detail page first.
// ACTION_REQUIRED deliberately has no entry: resolving it needs real input
// (free-text answer, or "I solved the CAPTCHA" confirmation via
// ActionRequiredResolver) that can't be reduced to a single click.
//
// READY_FOR_APPROVAL/DRY_RUN_COMPLETED deliberately have NO one-click submit
// action here anymore — approving is the one decision in this whole workflow
// that must involve actually looking at the drafted answers first (which
// resume was picked, what got filled in, confidence per field, any
// low-confidence/sensitive fields forcing MANUAL tier). A list-row one-click
// button skipped that entirely. These statuses fall through to the "Review"
// link below instead.
const ROW_ACTIONS = {
  READY_FOR_PREPARATION: { label: 'Prepare', path: (id) => `/applications/${id}/prepare`, body: null },
};

const REVIEW_STATUSES = new Set(['READY_FOR_APPROVAL', 'DRY_RUN_COMPLETED']);

// Bulk selection is only offered for these two statuses, and deliberately
// NOT for READY_FOR_APPROVAL/DRY_RUN_COMPLETED — those require opening each
// application and actually looking at its drafted answers first (see
// REVIEW_STATUSES/ROW_ACTIONS comment above). APPROVED apps were already
// individually reviewed at the approve step; bulk-submit here only batches
// the mechanical "now actually submit it" call, same reasoning as
// routes/applications.js's bulk-submit endpoint.
const BULK_CONFIGS = {
  READY_FOR_PREPARATION: { endpoint: 'bulk-prepare', max: 15, label: 'ready to prepare', actionLabel: 'Prepare Selected' },
  APPROVED:               { endpoint: 'bulk-submit',  max: 15, label: 'approved, ready to submit', actionLabel: 'Submit Selected' },
};

export default function ApprovalQueuePage() {
  const { user } = useAuth();
  const isAdmin = user?.email === ADMIN_EMAIL;
  const [bucket, setBucket] = useState('needsAction');
  const [page, setPage] = useState(1);
  const [skipping, setSkipping] = useState(() => new Set());
  const [markingApplied, setMarkingApplied] = useState(() => new Set());
  const [acting, setActing] = useState(() => new Set());
  const [selected, setSelected] = useState(() => new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkError, setBulkError] = useState(null);
  const [last7DaysOnly, setLast7DaysOnly] = useState(false);
  const [requeuing, setRequeuing] = useState(false);
  const [requeueMsg, setRequeueMsg] = useState(null);
  const statusParam = BUCKETS[bucket].statuses.join(',');
  const sort = BUCKETS[bucket].sort || 'recent';
  // maxAgeDays filters by JOB posting age, which only lines up with this
  // bucket's own sort axis for Needs Action (sorted by job recency/match) —
  // In Progress/Done/Issues sort by the application's own status-change
  // time instead, so an old job could legitimately still be actively moving
  // through the pipeline there. Keep the toggle scoped to Needs Action.
  const maxAgeDays = bucket === 'needsAction' && last7DaysOnly ? 7 : undefined;
  const { applications, total, loading, err, refetch } = useApplications({ status: statusParam, sort, page, limit: PAGE_SIZE, maxAgeDays });

  // Only one bulkable status can be active per bucket in practice (Needs
  // Action -> READY_FOR_PREPARATION, In Progress -> APPROVED) — if a bucket
  // ever mixed both, bulkStatus picks whichever has any rows present.
  const bulkStatus = Object.keys(BULK_CONFIGS).find(status =>
    BUCKETS[bucket].statuses.includes(status) && applications.some(a => a.status === status)
  );
  const bulkConfig = bulkStatus ? BULK_CONFIGS[bulkStatus] : null;
  const bulkableOnPage = bulkStatus ? applications.filter(a => a.status === bulkStatus) : [];

  const selectBucket = (key) => {
    setBucket(key);
    setPage(1);
    setSelected(new Set());
    setBulkError(null);
  };

  const toggleSelected = (id) => {
    if (!bulkConfig) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < bulkConfig.max) next.add(id);
      return next;
    });
  };

  const toggleSelectAllBulkable = () => {
    if (!bulkConfig) return;
    setSelected(prev =>
      prev.size === Math.min(bulkableOnPage.length, bulkConfig.max)
        ? new Set()
        : new Set(bulkableOnPage.slice(0, bulkConfig.max).map(a => a._id))
    );
  };

  const handleBulkAction = async () => {
    if (!selected.size || bulkRunning || !bulkConfig) return;
    setBulkRunning(true);
    setBulkError(null);
    try {
      const res = await authFetch(`/applications/${bulkConfig.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationIds: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bulk action failed');
      if (data.blockedManual?.length) {
        setBulkError(`${data.blockedManual.length} skipped — requires manual review (MANUAL confidence tier) before it can be submitted.`);
      }
      setSelected(new Set());
      refetch();
    } catch (e) {
      setBulkError(e.message);
    } finally {
      setBulkRunning(false);
    }
  };

  // Admin recovery action — requeues Applications stuck in DISCOVERED (never
  // picked up by a pipeline worker) and auto-resumes anything stale in an
  // in-flight status (EVALUATING/INSPECTING_FORM/PREPARING/APPLYING) with no
  // active worker. See routes/admin.js's requeue-stuck for why this exists:
  // a worker-side outage (e.g. DNS resolution failing before the fix in
  // workers/pipeline-worker.js) silently strands applications mid-pipeline
  // with no user-visible error — they just never advance past DISCOVERED, so
  // Needs Action can go quiet even though jobs ARE being scraped.
  const handleRequeueStuck = async () => {
    if (requeuing) return;
    setRequeuing(true);
    setRequeueMsg(null);
    try {
      const res = await authFetch('/admin/applications/requeue-stuck', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Requeue failed');
      setRequeueMsg(`Requeued ${data.requeued} stuck, recovered ${data.staleInFlightRecovered} stale in-flight`);
      refetch();
    } catch (e) {
      setRequeueMsg(e.message);
    } finally {
      setRequeuing(false);
    }
  };

  const handleSkip = async (e, id) => {
    e.preventDefault(); // row is a <Link> — don't navigate
    e.stopPropagation();
    if (skipping.has(id)) return;
    setSkipping(prev => new Set(prev).add(id));
    try {
      await authFetch(`/applications/${id}/skip`, { method: 'POST' });
      refetch();
    } finally {
      setSkipping(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  // Opens the job's own posting so the user can apply directly on the
  // company's site, then marks the Application APPLIED_MANUALLY (terminal —
  // see applicationState.js) so it drops out of Needs Action. Distinct from
  // the existing NONE-automation "Apply manually" link: that one is a plain
  // <a> with no status change (nothing here for our pipeline to automate
  // anyway); this is available on any Needs Action row and records that the
  // user chose to bypass the automated flow themselves.
  const handleMarkAppliedManually = async (e, app) => {
    e.preventDefault(); // row is a <Link> — don't navigate
    e.stopPropagation();
    const id = app._id;
    if (markingApplied.has(id)) return;
    if (app.job?.url) window.open(app.job.url, '_blank', 'noopener,noreferrer');
    setMarkingApplied(prev => new Set(prev).add(id));
    try {
      await authFetch(`/applications/${id}/applied-manually`, { method: 'POST' });
      refetch();
    } finally {
      setMarkingApplied(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const handleRowAction = async (e, id, action) => {
    e.preventDefault(); // row is a <Link> — don't navigate
    e.stopPropagation();
    if (acting.has(id)) return;
    setActing(prev => new Set(prev).add(id));
    try {
      await authFetch(action.path(id), {
        method: 'POST',
        ...(action.body && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action.body) }),
      });
      refetch();
    } finally {
      setActing(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <main>
      <div className="filter-bar">
        <div className="status-tabs">
          {Object.entries(BUCKETS).map(([key, { label }]) => (
            <button key={key} className={`status-tab${bucket === key ? ' active' : ''}`} onClick={() => selectBucket(key)}>
              {label}
            </button>
          ))}
        </div>
        <div className="filter-right">
          {bucket === 'needsAction' && (
            <label className="last7-toggle">
              <input
                type="checkbox"
                checked={last7DaysOnly}
                onChange={(e) => { setLast7DaysOnly(e.target.checked); setPage(1); }}
              />
              Last 7 days only
            </label>
          )}
          <span className="result-count">
            {loading ? '…' : total === 0 ? '0 results' : `${rangeStart}–${rangeEnd} of ${total}`}
          </span>
          <button className={`refresh-btn${loading ? ' spinning' : ''}`} onClick={refetch} disabled={loading} title="Refetch">
            <span className="spin-icon">↻</span>
          </button>
          {isAdmin && (
            <button
              className="page-btn"
              onClick={handleRequeueStuck}
              disabled={requeuing}
              title="Requeue applications stuck in DISCOVERED, and recover stale in-flight ones a worker never finished"
            >
              {requeuing ? 'Requeuing…' : 'Requeue Stuck'}
            </button>
          )}
        </div>
      </div>
      {requeueMsg && <p className="msg" style={{ margin: '4px 0 0' }}>{requeueMsg}</p>}

      {!loading && !err && total > PAGE_SIZE && (
        <div className="pagination">
          <button className="page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
            ← Prev
          </button>
          <span className="page-info">Page {page} of {totalPages}</span>
          <button className="page-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            Next →
          </button>
        </div>
      )}

      {loading && (
        <div className="loading-pulse">
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      )}

      {!loading && err && (
        <div className="err-state">
          <p className="msg error">Failed to load applications — {err}</p>
          <button className="page-btn" onClick={refetch}>Try again</button>
        </div>
      )}

      {bulkConfig && bulkableOnPage.length > 0 && (
        <div className="aq-bulk-bar">
          <label className="aq-bulk-selectall">
            <input
              type="checkbox"
              checked={selected.size > 0 && selected.size === Math.min(bulkableOnPage.length, bulkConfig.max)}
              onChange={toggleSelectAllBulkable}
            />
            Select all {bulkConfig.label} (max {bulkConfig.max} per batch)
          </label>
          <button
            className="btn-apply"
            disabled={!selected.size || bulkRunning}
            onClick={handleBulkAction}
          >
            {bulkRunning ? 'Starting…' : `${bulkConfig.actionLabel} (${selected.size})`}
          </button>
          {bulkError && <span className="msg error">{bulkError}</span>}
        </div>
      )}

      {!loading && !err && applications.length === 0 && (
        <div className="empty">
          <div className="empty-icon">📋</div>
          <p className="empty-title">Nothing here yet.</p>
          <p className="empty-hint">
            {bucket === 'needsAction'
              ? 'Applications land here once they\'re recommended (ready to prepare), drafted (ready for approval), waiting on you to resolve a CAPTCHA/login, or waiting on your re-approval after a dry run.'
              : 'No applications currently in this state.'}
          </p>
        </div>
      )}

      {!loading && !err && applications.length > 0 && (
        <div className="aq-list">
          {applications.map(app => (
            <Link key={app._id} to={`/applications/${app._id}`} className="aq-row">
              {bulkConfig && app.status === bulkStatus && (
                <input
                  type="checkbox"
                  className="aq-row-checkbox"
                  checked={selected.has(app._id)}
                  disabled={!selected.has(app._id) && selected.size >= bulkConfig.max}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => { e.stopPropagation(); toggleSelected(app._id); }}
                />
              )}
              <div className="aq-row-main">
                <div className="aq-row-title">{app.job?.title}</div>
                <div className="aq-row-sub">{app.job?.company} · {app.job?.location}</div>
              </div>
              <div className="aq-row-meta">
                {app.fitScore?.total != null && (
                  <span className="aq-score">{app.fitScore.total}%</span>
                )}
                {app.confidenceTier && (
                  <span className="aq-tier" style={{ color: TIER_COLOR[app.confidenceTier], borderColor: `${TIER_COLOR[app.confidenceTier]}40`, background: `${TIER_COLOR[app.confidenceTier]}12` }}>
                    {app.confidenceTier.replace('_', ' ')}
                  </span>
                )}
                <span className="aq-status">{STATUS_LABEL[app.status] || app.status}</span>
                {fmtRel(rowTimestamp(app)) && (
                  <span className="aq-timestamp" title={new Date(rowTimestamp(app)).toLocaleString()}>
                    {fmtRel(rowTimestamp(app))}
                  </span>
                )}
                {/* NONE-automation forms have nothing to auto-submit — the
                    server blocks it too (applyProcessor.js), this just
                    avoids a click that would bounce. */}
                {app.status === 'READY_FOR_APPROVAL' && app.formInspection?.automationCapability === 'NONE' ? (
                  <a
                    className="btn-apply aq-row-action-btn"
                    href={app.job?.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Apply manually ↗
                  </a>
                ) : ROW_ACTIONS[app.status] ? (
                  <button
                    className="btn-apply aq-row-action-btn"
                    onClick={(e) => handleRowAction(e, app._id, ROW_ACTIONS[app.status])}
                    disabled={acting.has(app._id)}
                  >
                    {acting.has(app._id) ? '…' : ROW_ACTIONS[app.status].label}
                  </button>
                ) : REVIEW_STATUSES.has(app.status) && (
                  <Link to={`/applications/${app._id}`} className="btn-apply aq-row-action-btn" onClick={(e) => e.stopPropagation()}>
                    Review →
                  </Link>
                )}
                {app.status === 'ACTION_REQUIRED' && (
                  <Link to={`/applications/${app._id}`} className="btn-apply aq-row-action-btn" onClick={(e) => e.stopPropagation()}>
                    Resolve →
                  </Link>
                )}
                {MANUAL_APPLY_ELIGIBLE.has(app.status) && (
                  <button
                    className="aq-manual-apply-btn"
                    onClick={(e) => handleMarkAppliedManually(e, app)}
                    disabled={markingApplied.has(app._id)}
                    title="Applied manually — opens the job posting and marks this as applied outside the tool"
                  >
                    {markingApplied.has(app._id) ? '…' : '🖐️'}
                  </button>
                )}
                {!SKIPPABLE_EXCLUDE.has(app.status) && (
                  <button
                    className="aq-skip-btn"
                    onClick={(e) => handleSkip(e, app._id)}
                    disabled={skipping.has(app._id)}
                    title="Skip — pass on this role"
                  >
                    ✕
                  </button>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {!loading && !err && total > PAGE_SIZE && (
        <div className="pagination">
          <button className="page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
            ← Prev
          </button>
          <span className="page-info">Page {page} of {totalPages}</span>
          <button className="page-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            Next →
          </button>
        </div>
      )}
    </main>
  );
}
