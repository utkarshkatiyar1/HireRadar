import { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch } from '../auth';
import { usePolling } from './usePolling';

// Extracted from the original App.jsx — fetch/poll/mutate logic for the jobs
// list + stats, unchanged behavior (5-min poll, abortable in-flight fetch,
// optimistic mark-applied/dismiss updates).
export function useJobs({ token, smartFilter }) {
  const [jobs, setJobs]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [stats, setStats]       = useState(null);

  const abortRef = useRef(null);

  const fetchJobs = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const url = smartFilter ? '/jobs' : '/jobs?raw=1';
      const res = await authFetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setJobs(await res.json());
      setLastSync(new Date());
      setErr(null);
    } catch (e) {
      if (e.name === 'AbortError') return;
      setErr(e.message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
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
  }, [token, fetchJobs, fetchStats]);

  usePolling(() => { fetchJobs(); fetchStats(); }, 5 * 60_000, !!token);

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

  const refetch = () => { fetchJobs(); fetchStats(); };

  return { jobs, stats, loading, err, lastSync, markApplied, dismissJob, refetch };
}
