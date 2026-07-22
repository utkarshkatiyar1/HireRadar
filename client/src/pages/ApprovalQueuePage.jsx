import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApplications } from '../hooks/useApplications';

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

export default function ApprovalQueuePage() {
  const [bucket, setBucket] = useState('needsAction');
  const statusParam = BUCKETS[bucket].statuses.join(',');
  const { applications, total, loading, err, refetch } = useApplications({ status: statusParam });

  return (
    <main>
      <div className="filter-bar">
        <div className="status-tabs">
          {Object.entries(BUCKETS).map(([key, { label }]) => (
            <button key={key} className={`status-tab${bucket === key ? ' active' : ''}`} onClick={() => setBucket(key)}>
              {label}
            </button>
          ))}
        </div>
        <div className="filter-right">
          <span className="result-count">{loading ? '…' : `${total} result${total !== 1 ? 's' : ''}`}</span>
          <button className={`refresh-btn${loading ? ' spinning' : ''}`} onClick={refetch} disabled={loading} title="Refetch">
            <span className="spin-icon">↻</span>
          </button>
        </div>
      </div>

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
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
