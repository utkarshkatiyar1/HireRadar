import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApplications } from '../hooks/useApplications';
import { authFetch } from '../auth';

// Matches ApplicationDetail.jsx's own guard for when Skip is offered — once
// an application reaches one of these, skipping no longer makes sense.
const SKIPPABLE_EXCLUDE = new Set(['SUBMITTED', 'SKIPPED', 'REJECTED', 'CANCELLED']);

const BUCKETS = {
  needsAction: { label: 'Needs Action', statuses: ['READY_FOR_APPROVAL', 'ACTION_REQUIRED'] },
  inProgress:  { label: 'In Progress',  statuses: ['DISCOVERED', 'EVALUATING', 'READY_FOR_PREPARATION', 'INSPECTING_FORM', 'PREPARING', 'APPROVED', 'APPLYING'] },
  done:        { label: 'Done',         statuses: ['SUBMITTED', 'DRY_RUN_COMPLETED'] },
  issues:      { label: 'Issues',       statuses: ['REJECTED', 'FAILED', 'SUBMISSION_UNCONFIRMED', 'SUBMISSION_BLOCKED'] },
};

const TIER_COLOR = {
  AUTO: '#22c55e', QUICK_APPROVE: '#2dd4bf', DRAFT_ONLY: '#f97316', MANUAL: '#f87171',
};

const STATUS_LABEL = {
  DISCOVERED: 'Discovered', EVALUATING: 'Evaluating', REJECTED: 'Rejected', SKIPPED: 'Skipped',
  READY_FOR_PREPARATION: 'Ready to Prepare', INSPECTING_FORM: 'Inspecting Form', PREPARING: 'Preparing',
  READY_FOR_APPROVAL: 'Ready for Approval', APPROVED: 'Approved', APPLYING: 'Applying',
  ACTION_REQUIRED: 'Action Required', DRY_RUN_COMPLETED: 'Dry-Run Completed', SUBMITTED: 'Submitted',
  SUBMISSION_UNCONFIRMED: 'Submission Unconfirmed', SUBMISSION_BLOCKED: 'Submission Blocked',
  CANCELLED: 'Cancelled', EXPIRED: 'Expired', FAILED: 'Failed',
};

const PAGE_SIZE = 50;

export default function ApprovalQueuePage() {
  const [bucket, setBucket] = useState('needsAction');
  const [page, setPage] = useState(1);
  const [skipping, setSkipping] = useState(() => new Set());
  const statusParam = BUCKETS[bucket].statuses.join(',');
  const { applications, total, loading, err, refetch } = useApplications({ status: statusParam, page, limit: PAGE_SIZE });

  const selectBucket = (key) => {
    setBucket(key);
    setPage(1);
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
          <span className="result-count">
            {loading ? '…' : total === 0 ? '0 results' : `${rangeStart}–${rangeEnd} of ${total}`}
          </span>
          <button className={`refresh-btn${loading ? ' spinning' : ''}`} onClick={refetch} disabled={loading} title="Refetch">
            <span className="spin-icon">↻</span>
          </button>
        </div>
      </div>

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

      {!loading && !err && applications.length === 0 && (
        <div className="empty">
          <div className="empty-icon">📋</div>
          <p className="empty-title">Nothing here yet.</p>
          <p className="empty-hint">
            {bucket === 'needsAction'
              ? 'Applications land here once eligibility and fit-scoring recommend them and you\'ve explicitly prepared them.'
              : 'No applications currently in this state.'}
          </p>
        </div>
      )}

      {!loading && !err && applications.length > 0 && (
        <div className="aq-list">
          {applications.map(app => (
            <Link key={app._id} to={`/applications/${app._id}`} className="aq-row">
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
