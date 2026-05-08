const DAY_MS = 86_400_000;

const fmt = (d) => {
  try {
    return new Date(d).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
  } catch { return '–'; }
};

const isNew = (firstSeen) => firstSeen && (Date.now() - new Date(firstSeen).getTime()) < DAY_MS;

const linkedInUrl = (company) => {
  const slug = company.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  return `https://www.linkedin.com/company/${slug}/`;
};

const ATS_DOT = {
  workday:    'workday',
  greenhouse: 'greenhouse',
  lever:      'lever',
  eightfold:  'eightfold',
  custom:     'custom',
};

export default function JobTable({ jobs, onMarkApplied, onDismiss }) {
  if (!jobs.length) {
    return (
      <div className="empty">
        <div className="empty-icon">📡</div>
        <p className="empty-title">No jobs match your filters.</p>
        <code>node src/index.js</code>
        <p className="empty-hint">Run the scraper to fetch jobs, or adjust your filters above.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Company</th>
            <th>Location</th>
            <th>Exp</th>
            <th>Posted</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map(j => (
            <tr key={j._id} className={j.applied ? 'row-applied' : ''}>
              <td className="td-title">
                {j.title}
                {isNew(j.firstSeen) && !j.applied && (
                  <span className="badge-new">NEW</span>
                )}
              </td>
              <td>
                <span className="co-badge">
                  <span className={`ats-dot ${ATS_DOT[j.ats] ?? 'custom'}`} />
                  {j.company}
                </span>
              </td>
              <td>{j.location || '–'}</td>
              <td className="td-exp">{j.exp || '–'}</td>
              <td className="td-date">{fmt(j.date)}</td>
              <td className="td-actions">
                <div className="actions-cell">
                  <a
                    href={j.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-apply"
                  >
                    Apply →
                  </a>
                  <a
                    href={linkedInUrl(j.company)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-referral"
                    title={`Find ${j.company} connections on LinkedIn`}
                  >
                    Referral
                  </a>
                  {j.applied
                    ? <span className="badge-applied">✓ Applied</span>
                    : (
                      <button
                        className="btn-mark"
                        onClick={() => onMarkApplied(j._id)}
                      >
                        Mark Applied
                      </button>
                    )
                  }
                  {!j.applied && (
                    <button
                      className="btn-dismiss"
                      onClick={() => onDismiss(j._id)}
                      title="Not applicable — hide this job"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
