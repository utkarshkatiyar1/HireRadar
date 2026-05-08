import { useState, useEffect, useCallback, useMemo } from 'react';
import JobTable      from './components/JobTable';
import StatsPanel    from './components/StatsPanel';
import CompaniesPage from './components/CompaniesPage';

export default function App() {
  const [page, setPage] = useState('jobs'); // 'jobs' | 'progress' | 'companies'

  const [jobs, setJobs]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [stats, setStats]       = useState(null);

  const [statusFilter, setStatusFilter]   = useState('all');
  const [search, setSearch]               = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [currentPage, setCurrentPage]     = useState(1);
  const [smartFilter, setSmartFilter]     = useState(true);

  const PAGE_SIZE = 50;

  const fetchJobs = useCallback(async () => {
    try {
      const url = smartFilter ? '/jobs' : '/jobs?raw=1';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setJobs(await res.json());
      setLastSync(new Date());
      setErr(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [smartFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/jobs/stats');
      if (res.ok) setStats(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchStats();
    const id = setInterval(() => { fetchJobs(); fetchStats(); }, 60_000);
    return () => clearInterval(id);
  }, [fetchJobs, fetchStats]);

  const markApplied = async (id) => {
    try {
      await fetch(`/jobs/${id}/apply`, { method: 'PATCH' });
      setJobs(prev => prev.map(j => j._id === id ? { ...j, applied: true, appliedAt: new Date().toISOString() } : j));
      fetchStats();
    } catch (e) {
      console.error('markApplied:', e);
    }
  };

  const dismissJob = async (id) => {
    try {
      await fetch(`/jobs/${id}/dismiss`, { method: 'PATCH' });
      setJobs(prev => prev.filter(j => j._id !== id));
    } catch (e) {
      console.error('dismissJob:', e);
    }
  };

  const applied = jobs.filter(j => j.applied).length;
  const pending = jobs.length - applied;

  const companies = useMemo(
    () => [...new Set(jobs.map(j => j.company))].sort(),
    [jobs]
  );

  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

  const displayed = useMemo(() => {
    const q     = search.trim().toLowerCase();
    const since = new Date(Date.now() - THREE_DAYS_MS);
    return jobs
      .filter(j =>
        statusFilter === 'applied' ? j.applied :
        statusFilter === 'pending' ? !j.applied :
        true
      )
      .filter(j => !smartFilter || statusFilter === 'applied' || new Date(j.firstSeen) >= since)
      .filter(j => companyFilter === 'all' || j.company === companyFilter)
      .filter(j =>
        !q ||
        (j.title    ?? '').toLowerCase().includes(q) ||
        (j.company  ?? '').toLowerCase().includes(q) ||
        (j.location ?? '').toLowerCase().includes(q)
      );
  }, [jobs, statusFilter, companyFilter, search, smartFilter]);

  useEffect(() => { setCurrentPage(1); }, [statusFilter, companyFilter, search]);

  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE));
  const paginated  = displayed.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <>
      {/* ── Header ── */}
      <header className="header">
        <div className="header-logo">
          <span className="logo-text">HIRE·RADAR</span>
          <span className="logo-sub">React · Frontend · MERN &nbsp;·&nbsp; India / Remote &nbsp;·&nbsp; 0–2 yrs</span>
        </div>
        <div className="header-right">
          <nav className="page-tabs">
            <button
              className={`page-tab${page === 'jobs' ? ' active' : ''}`}
              onClick={() => setPage('jobs')}
            >
              Jobs
              {pending > 0 && <span className="page-tab-count">{pending}</span>}
            </button>
            <button
              className={`page-tab${page === 'progress' ? ' active teal' : ''}`}
              onClick={() => setPage('progress')}
            >
              My Progress
              {applied > 0 && <span className="page-tab-count">{applied}</span>}
            </button>
            <button
              className={`page-tab${page === 'companies' ? ' active' : ''}`}
              onClick={() => setPage('companies')}
            >
              Companies
            </button>
          </nav>
          <div className="header-stats">
            <div className="stat-card">
              <span className="stat-n">{jobs.length}</span>
              <span className="stat-l">Total</span>
            </div>
            <div className="stat-card">
              <span className="stat-n orange">{pending}</span>
              <span className="stat-l">Pending</span>
            </div>
            <div className="stat-card">
              <span className="stat-n teal">{applied}</span>
              <span className="stat-l">Applied</span>
            </div>
            {lastSync && (
              <span className="sync-badge">
                Synced {lastSync.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="app">
      {/* ── Jobs Page ── */}
      {page === 'jobs' && (
        <>
          <div className="filter-bar">
            <div className="status-tabs">
              <button
                className={`status-tab${statusFilter === 'all' ? ' active' : ''}`}
                onClick={() => setStatusFilter('all')}
              >
                All <span className="tab-count">{jobs.length}</span>
              </button>
              <button
                className={`status-tab${statusFilter === 'pending' ? ' active' : ''}`}
                onClick={() => setStatusFilter('pending')}
              >
                Pending <span className="tab-count">{pending}</span>
              </button>
              <button
                className={`status-tab teal-tab${statusFilter === 'applied' ? ' active' : ''}`}
                onClick={() => setStatusFilter('applied')}
              >
                Applied <span className="tab-count">{applied}</span>
              </button>
            </div>
            <div className="filter-right">
              <input
                className="search-input"
                type="search"
                placeholder="Search title, company, location…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <select
                className="company-select"
                value={companyFilter}
                onChange={e => setCompanyFilter(e.target.value)}
              >
                <option value="all">All companies</option>
                {companies.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <button
                className={`smart-filter-toggle${smartFilter ? ' on' : ''}`}
                onClick={() => setSmartFilter(v => !v)}
                title={smartFilter ? 'Smart filters ON — click to see all raw jobs' : 'Smart filters OFF — click to enable'}
              >
                <span className="toggle-track">
                  <span className="toggle-thumb" />
                </span>
                Smart Filter
              </button>
              <span className="result-count">
                {displayed.length} result{displayed.length !== 1 ? 's' : ''}
              </span>
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
            {!loading && err && <p className="msg error">Error: {err}</p>}
            {!loading && !err && (
              <>
                <JobTable jobs={paginated} onMarkApplied={markApplied} onDismiss={dismissJob} />
                {totalPages > 1 && (
                  <div className="pagination">
                    <button
                      className="page-btn"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      ← Prev
                    </button>
                    <span className="page-info">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      className="page-btn"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </main>
        </>
      )}

      {/* ── Progress Page ── */}
      {page === 'progress' && (
        <main className="progress-page">
          {stats
            ? <StatsPanel stats={stats} />
            : <p className="msg">Loading stats…</p>
          }
        </main>
      )}

      {/* ── Companies Page ── */}
      {page === 'companies' && (
        <main>
          <CompaniesPage />
        </main>
      )}

      {/* ── Footer ── */}
      <footer className="footer">
        <span className="footer-copy">© {new Date().getFullYear()} Utkarsh Katiyar · HireRadar</span>
        <span className="footer-sep">·</span>
        <span className="footer-note">Personal job aggregator — not affiliated with any listed company</span>
      </footer>
      </div>
    </>
  );
}
