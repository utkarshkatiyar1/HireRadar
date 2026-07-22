import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { authFetch } from '../auth';

const fmt = (d) => {
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  } catch { return '–'; }
};

// Lowest-risk new surface — GET /jobs/:id already returns full job objects,
// no new pipeline dependency. Good rehearsal for the useParams() detail-page
// pattern before the heavier Applications/Candidate-Profile work.
export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/jobs/${id}`);
      if (!res.ok) throw new Error(res.status === 404 ? 'Job not found' : `HTTP ${res.status}`);
      setJob(await res.json());
      setErr(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const markApplied = async () => {
    setBusy(true);
    try {
      await authFetch(`/jobs/${id}/apply`, { method: 'PATCH' });
      setJob(j => ({ ...j, applied: true, appliedAt: new Date().toISOString() }));
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async () => {
    setBusy(true);
    try {
      await authFetch(`/jobs/${id}/dismiss`, { method: 'PATCH' });
      navigate('/jobs');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <main>
        <div className="loading-pulse">
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      </main>
    );
  }

  if (err) {
    return (
      <main>
        <div className="err-state">
          <p className="msg error">{err}</p>
          <Link className="page-btn" to="/jobs">← Back to jobs</Link>
        </div>
      </main>
    );
  }

  return (
    <main>
      <Link to="/jobs" className="page-btn" style={{ marginBottom: 16, display: 'inline-block' }}>← Back to jobs</Link>

      <div className="jc-card" style={{ maxWidth: 640 }}>
        <div className="jc-co-row">
          <div className="jc-co-body">
            <span className="jc-co-name">{job.company}</span>
            <span className="jc-ats-chip"><span className="jc-ats-dot" />{job.ats}</span>
          </div>
        </div>

        <h1 className="jc-title" style={{ fontSize: '1.4rem' }}>{job.title}</h1>

        <div className="jc-meta">
          {job.location && <span className="jc-meta-tag">{job.location}</span>}
          {job.exp && <span className="jc-meta-tag">{job.exp}</span>}
          {job.date && <span className="jc-meta-tag">Posted {fmt(job.date)}</span>}
        </div>

        <div className="jc-actions" style={{ marginTop: 20 }}>
          {job.applied ? (
            <span className="badge-applied">Applied {job.appliedAt ? fmt(job.appliedAt) : ''}</span>
          ) : (
            <>
              <a href={job.url} target="_blank" rel="noopener noreferrer" className="btn-apply">Apply on {job.company}'s site →</a>
              <button className="btn-mark" onClick={markApplied} disabled={busy}>Mark Applied</button>
              <button className="jc-dismiss" onClick={dismiss} disabled={busy} title="Hide this job">Dismiss</button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
