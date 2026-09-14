import { useState, useMemo, useEffect } from 'react';
import JobTable from '../components/JobTable';
import JobCards from '../components/JobCards';
import { useAuth, authFetch } from '../auth';
import { useJobs } from '../hooks/useJobs';
import { ADMIN_EMAIL } from '../routes/guards';

const fmtRel = (d) => {
  if (!d) return null;
  const s = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 10)    return 'just now';
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export default function JobsPage() {
  const { token, user } = useAuth();
  const isAdmin = user?.email === ADMIN_EMAIL;

  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick(n => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const [statusFilter, setStatusFilter]   = useState('all');
  const [search, setSearch]               = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [currentPage, setCurrentPage]     = useState(1);
  const [smartFilter, setSmartFilter]     = useState(true);
  const [scraping, setScraping]           = useState(false);
  const [jobView, setJobView]             = useState(() => localStorage.getItem('hr-view') || 'cards');

  const PAGE_SIZE = 50;

  const { jobs, loading, err, lastSync, markApplied, dismissJob, refetch } = useJobs({ token, smartFilter });

  const triggerScrape = async () => {
    if (scraping) return;
    setScraping(true);
    try {
      const res = await authFetch('/admin/scrape', { method: 'POST' });
      if (!res.ok) {
        const { error } = await res.json();
        alert(error || 'Scrape failed to start');
      }
    } catch (e) {
      console.error('triggerScrape:', e);
    } finally {
      const poll = setInterval(async () => {
        const r = await authFetch('/admin/scrape');
        if (r.ok) {
          const { running } = await r.json();
          if (!running) {
            clearInterval(poll);
            setScraping(false);
            refetch();
          }
        } else {
          clearInterval(poll);
          setScraping(false);
        }
      }, 3000);
    }
  };

  const applied = jobs.filter(j => j.applied).length;
  const pending = jobs.length - applied;

  const companies = useMemo(
    () => [...new Set(jobs.map(j => j.company))].sort(),
    [jobs]
  );

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs
      .filter(j =>
        statusFilter === 'applied' ? j.applied :
        statusFilter === 'pending' ? !j.applied :
        true
      )
      .filter(j => companyFilter === 'all' || j.company === companyFilter)
      .filter(j =>
        !q ||
        (j.title    ?? '').toLowerCase().includes(q) ||
        (j.company  ?? '').toLowerCase().includes(q) ||
        (j.location ?? '').toLowerCase().includes(q)
      );
  }, [jobs, statusFilter, companyFilter, search]);

  useEffect(() => { setCurrentPage(1); }, [statusFilter, companyFilter, search, jobView]);

  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE));
  const paginated  = displayed.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <>
      <div className="filter-bar">
        <div className="status-tabs">
          <button className={`status-tab${statusFilter === 'all' ? ' active' : ''}`} onClick={() => setStatusFilter('all')}>
            All <span className="tab-count">{jobs.length}</span>
          </button>
          <button className={`status-tab${statusFilter === 'pending' ? ' active' : ''}`} onClick={() => setStatusFilter('pending')}>
            Pending <span className="tab-count">{pending}</span>
          </button>
          <button className={`status-tab teal-tab${statusFilter === 'applied' ? ' active' : ''}`} onClick={() => setStatusFilter('applied')}>
            Applied <span className="tab-count">{applied}</span>
          </button>
        </div>
        <div className="filter-right">
          {lastSync && (
            <span className="sync-badge" title={lastSync.toLocaleString()}>
              <span className="live-dot" />
              {fmtRel(lastSync)}
            </span>
          )}
          <input
            className="search-input"
            type="search"
            placeholder="Search title, company, location…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="company-select" value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}>
            <option value="all">All companies</option>
            {companies.map(c => (<option key={c} value={c}>{c}</option>))}
          </select>
          <button
            className={`smart-filter-toggle${smartFilter ? ' on' : ''}`}
            onClick={() => setSmartFilter(v => !v)}
            title={smartFilter ? 'Smart filters ON — click to see all raw jobs' : 'Smart filters OFF — click to enable'}
          >
            <span className="toggle-track"><span className="toggle-thumb" /></span>
            Smart Filter
          </button>
          {(statusFilter !== 'all' || search || companyFilter !== 'all') && (
            <button
              className="clear-filters-btn"
              onClick={() => { setStatusFilter('all'); setSearch(''); setCompanyFilter('all'); }}
              title="Clear all filters"
            >
              × Clear
            </button>
          )}
          <div className="view-toggle">
            <button
              className={`view-btn${jobView === 'cards' ? ' active' : ''}`}
              onClick={() => { setJobView('cards'); localStorage.setItem('hr-view', 'cards'); }}
              title="Card view"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                <rect x="1" y="1" width="5" height="5" rx="1.5"/>
                <rect x="8" y="1" width="5" height="5" rx="1.5"/>
                <rect x="1" y="8" width="5" height="5" rx="1.5"/>
                <rect x="8" y="8" width="5" height="5" rx="1.5"/>
              </svg>
            </button>
            <button
              className={`view-btn${jobView === 'table' ? ' active' : ''}`}
              onClick={() => { setJobView('table'); localStorage.setItem('hr-view', 'table'); }}
              title="Table view"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                <rect x="1" y="2"    width="12" height="1.5" rx=".75"/>
                <rect x="1" y="6.3"  width="12" height="1.5" rx=".75"/>
                <rect x="1" y="10.5" width="12" height="1.5" rx=".75"/>
              </svg>
            </button>
          </div>
          <span className="result-count">
            {loading ? '…' : `${displayed.length} result${displayed.length !== 1 ? 's' : ''}`}
          </span>
          <button className={`refresh-btn${loading ? ' spinning' : ''}`} onClick={refetch} disabled={loading} title="Refetch jobs from server">
            <span className="spin-icon">↻</span>
          </button>
          {isAdmin && (
            <button className={`scrape-btn${scraping ? ' running' : ''}`} onClick={triggerScrape} disabled={scraping} title="Trigger a full scrape run on the server">
              {scraping ? 'Scraping…' : '⚡ Run Scrape'}
            </button>
          )}
        </div>
      </div>

      <main>
        {loading && (
          <div className="loading-pulse">
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </div>
        )}
        {!loading && err && (
          <div className="err-state">
            <p className="msg error">Failed to load jobs — {err}</p>
            <button className="page-btn" onClick={refetch}>Try again</button>
          </div>
        )}
        {!loading && !err && (
          <>
            {jobView === 'cards'
              ? <JobCards jobs={paginated} onMarkApplied={markApplied} onDismiss={dismissJob} />
              : <JobTable jobs={paginated} onMarkApplied={markApplied} onDismiss={dismissJob} />
            }
            {totalPages > 1 && (
              <div className="pagination">
                <button className="page-btn" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                  ← Prev
                </button>
                <span className="page-info">Page {currentPage} of {totalPages}</span>
                <button className="page-btn" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
