import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { authFetch } from '../auth';

// The screenshot route requires auth (requireAuth + signed HMAC — see
// server/src/routes/applications.js), so a plain <img src> can't be used
// directly (no Authorization header on image requests). Fetch each as a
// blob via authFetch instead and render via an object URL.
function AuthedImage({ path, alt, onClick }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let objectUrl;
    authFetch(path)
      .then(res => (res.ok ? res.blob() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(blob => { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); })
      .catch(() => setUrl(null));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [path]);

  if (!url) return <div className="aq-screenshot-thumb aq-screenshot-loading">Loading…</div>;
  return <img src={url} alt={alt} onClick={onClick} style={{ cursor: 'pointer' }} />;
}

export default function AuditTrailPage() {
  const { applicationId } = useParams();
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [lightboxPath, setLightboxPath] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await authFetch(`/applications/${applicationId}/audit`);
        if (!res.ok) throw new Error(res.status === 404 ? 'Audit trail not found' : `HTTP ${res.status}`);
        setAudit(await res.json());
        setErr(null);
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [applicationId]);

  if (loading) return <main><div className="loading-pulse"><div className="skeleton-row" /></div></main>;

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

  const screenshots = audit.auditLog.filter(e => e.screenshotUrl);

  return (
    <main>
      <Link to={`/applications/${applicationId}`} className="page-btn" style={{ marginBottom: 16, display: 'inline-block' }}>← Back to application</Link>

      <div className="aq-detail">
        <h1 className="aq-detail-title">Audit Trail</h1>

        {audit.confirmation?.detected && (
          <div className="aq-section">
            <div className="aq-section-title">Confirmation</div>
            <p className="aq-row-sub">Reference: {audit.confirmation.applicationReference || 'n/a'}</p>
            {audit.confirmation.finalUrl && (
              <p className="aq-row-sub">Final URL: <a href={audit.confirmation.finalUrl} target="_blank" rel="noopener noreferrer">{audit.confirmation.finalUrl}</a></p>
            )}
          </div>
        )}

        {audit.answers?.length > 0 && (
          <div className="aq-section">
            <div className="aq-section-title">Submitted answers</div>
            <div className="aq-answers">
              {audit.answers.map(a => (
                <div className="aq-answer-row" key={a.fieldKey}>
                  <div className="aq-answer-label">{a.fieldLabel || a.fieldKey}</div>
                  <div className="aq-answer-value">{a.value || <em className="aq-answer-blank">left blank</em>}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="aq-section">
          <div className="aq-section-title">Timeline</div>
          <div className="aq-audit-log">
            {audit.auditLog.map((entry, i) => (
              <div className="aq-audit-entry" key={i}>
                <span className="aq-audit-time">{new Date(entry.at).toLocaleString()}</span>
                <span className="aq-audit-action">{entry.action}</span>
              </div>
            ))}
          </div>
        </div>

        {screenshots.length > 0 && (
          <div className="aq-section">
            <div className="aq-section-title">Screenshots</div>
            <div className="aq-screenshot-grid">
              {screenshots.map((entry, i) => (
                <div key={i} className="aq-screenshot-thumb">
                  <AuthedImage path={entry.screenshotUrl} alt={entry.action} onClick={() => setLightboxPath(entry.screenshotUrl)} />
                  <span className="aq-screenshot-caption">{entry.action}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {lightboxPath && (
        <div className="aq-lightbox-overlay" onClick={() => setLightboxPath(null)}>
          <AuthedImage path={lightboxPath} alt="Screenshot" />
        </div>
      )}
    </main>
  );
}
