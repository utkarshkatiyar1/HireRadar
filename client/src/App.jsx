import { useState, useEffect, useCallback, useMemo } from 'react';
import JobTable      from './components/JobTable';
import StatsPanel    from './components/StatsPanel';
import CompaniesPage from './components/CompaniesPage';
import Leaderboard   from './components/Leaderboard';
import AuthScreen    from './components/AuthScreen';
import TerminalPage  from './components/TerminalPage';
import { useAuth, authFetch } from './auth';

const ADMIN_EMAIL = 'utkarshkatiyar688@gmail.com';

const fmtRel = (d) => {
  if (!d) return null;
  const s = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 10)    return 'just now';
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export default function App() {
  const { token, user, logout } = useAuth();

  const isAdmin = user?.email === ADMIN_EMAIL;

  const [page, setPage] = useState('jobs'); // 'jobs' | 'progress' | 'companies' | 'leaderboard' | 'terminal'
  const [, forceTick]   = useState(0);

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
  const [scraping, setScraping]           = useState(false);

  const PAGE_SIZE = 50;

  const fetchJobs = useCallback(async () => {
    try {
      const url = smartFilter ? '/jobs' : '/jobs?raw=1';
      const res = await authFetch(url);
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
      const res = await authFetch('/jobs/stats');
      if (res.ok) setStats(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetchJobs();
    fetchStats();
    const id = setInterval(() => { fetchJobs(); fetchStats(); }, 60_000);
    return () => clearInterval(id);
  }, [token, fetchJobs, fetchStats]);

  // Tick the relative-time label in the sync badge every 30s.
  useEffect(() => {
    const id = setInterval(() => forceTick(n => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const markApplied = async (id) => {
    try {
      await authFetch(`/jobs/${id}/apply`, { method: 'PATCH' });
      setJobs(prev => prev.map(j => j._id === id ? { ...j, applied: true, appliedAt: new Date().toISOString() } : j));
      fetchStats();
    } catch (e) {
      console.error('markApplied:', e);
    }
  };

  const dismissJob = async (id) => {
    try {
      await authFetch(`/jobs/${id}/dismiss`, { method: 'PATCH' });
      setJobs(prev => prev.filter(j => j._id !== id));
    } catch (e) {
      console.error('dismissJob:', e);
    }
  };

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
      // Poll until scrape finishes, then refetch jobs
      const poll = setInterval(async () => {
        const r = await authFetch('/admin/scrape');
        if (r.ok) {
          const { running } = await r.json();
          if (!running) {
            clearInterval(poll);
            setScraping(false);
            fetchJobs();
            fetchStats();
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
  }, [jobs, statusFilter, companyFilter, search, smartFilter]);

  useEffect(() => { setCurrentPage(1); }, [statusFilter, companyFilter, search]);

  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE));
  const paginated  = displayed.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (!token) return <AuthScreen />;

  return (
    <>
      {/* ── Header ── */}
      <header className="header">
        <div className="header-logo">
          <span className="logo-text">HIRE·RADAR</span>
        </div>

        <nav className="page-tabs">
          <button className={`page-tab${page === 'jobs' ? ' active' : ''}`} onClick={() => setPage('jobs')}>
            Jobs
            {pending > 0 && <span className="page-tab-count">{pending}</span>}
          </button>
          <button className={`page-tab${page === 'progress' ? ' active teal' : ''}`} onClick={() => setPage('progress')}>
            Progress
            {applied > 0 && <span className="page-tab-count teal">{applied}</span>}
          </button>
          <button className={`page-tab${page === 'companies' ? ' active' : ''}`} onClick={() => setPage('companies')}>
            Companies
          </button>
          <button className={`page-tab${page === 'leaderboard' ? ' active' : ''}`} onClick={() => setPage('leaderboard')}>
            Leaderboard
          </button>
          {isAdmin && (
            <button className={`page-tab terminal-tab${page === 'terminal' ? ' active' : ''}`} onClick={() => setPage('terminal')}>
              Terminal
            </button>
          )}
        </nav>

        <div className="header-controls">
          {lastSync && (
            <span className="sync-badge" title={lastSync.toLocaleString()}>
              <span className="live-dot" />
              {fmtRel(lastSync)}
            </span>
          )}
          {user && (
            <div className="user-chip" title={user.email}>
              <span className="user-avatar">{user.name[0].toUpperCase()}</span>
              <span className="user-name">{user.name}</span>
              <button className="user-logout" onClick={logout}>Log out</button>
            </div>
          )}
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
              <button
                className={`refresh-btn${loading ? ' spinning' : ''}`}
                onClick={() => { fetchJobs(); fetchStats(); }}
                disabled={loading}
                title="Refetch jobs from server"
              >
                ↻
              </button>
              {isAdmin && (
                <button
                  className={`scrape-btn${scraping ? ' running' : ''}`}
                  onClick={triggerScrape}
                  disabled={scraping}
                  title="Trigger a full scrape run on the server"
                >
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

      {/* ── Leaderboard Page ── */}
      {page === 'leaderboard' && (
        <main>
          <Leaderboard currentUserId={user?.id} />
        </main>
      )}

      {/* ── Terminal Page (admin only) ── */}
      {page === 'terminal' && isAdmin && (
        <main className="terminal-main">
          <TerminalPage />
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
