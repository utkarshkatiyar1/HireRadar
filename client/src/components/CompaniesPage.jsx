import { useState, useEffect } from 'react';

const ATS_LABEL = {
  greenhouse:      'Greenhouse',
  lever:           'Lever',
  workday:         'Workday',
  ashby:           'Ashby',
  eightfold:       'Eightfold',
  smartrecruiters: 'SmartRecruiters',
  'taleo-ssr':     'Taleo',
  'custom-api':    'Custom API',
  playwright:      'Playwright',
};

export default function CompaniesPage() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/jobs/sources')
      .then(r => r.json())
      .then(data => { setSources(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const grouped = sources.reduce((acc, s) => {
    const k = s.ats;
    if (!acc[k]) acc[k] = [];
    acc[k].push(s.company);
    return acc;
  }, {});

  if (loading) return <p className="msg">Loading sources…</p>;

  return (
    <div className="companies-page">
      <div className="companies-header">
        <span className="companies-total">{sources.length} companies tracked</span>
      </div>
      <div className="companies-groups">
        {Object.entries(grouped).map(([ats, companies]) => (
          <div key={ats} className="ats-group">
            <div className="ats-group-header">
              <span className={`ats-dot ${ats === 'custom-api' || ats === 'playwright' ? 'custom' : ats.replace('-ssr','')}`} />
              <span className="ats-group-name">{ATS_LABEL[ats] ?? ats}</span>
              <span className="ats-group-count">{companies.length}</span>
            </div>
            <div className="ats-company-grid">
              {companies.sort().map(c => (
                <div key={c} className="company-chip">{c}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
