import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../auth';
import { usePolling } from './usePolling';

// GET /applications — read-only, no side effects (see backend's Pipeline
// orchestration notes: a GET must never create records or enqueue work).
export function useApplications({ status, sort = 'recent', page = 1, limit = 50, enabled = true } = {}) {
  const [applications, setApplications] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const fetchApplications = useCallback(async () => {
    if (!enabled) return;
    try {
      const params = new URLSearchParams({ sort, page, limit });
      if (status) params.set('status', status);
      const res = await authFetch(`/applications?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setApplications(data.applications);
      setTotal(data.total);
      setErr(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [status, sort, page, limit, enabled]);

  useEffect(() => {
    setLoading(true);
    fetchApplications();
  }, [fetchApplications]);

  usePolling(fetchApplications, 60_000, enabled);

  return { applications, total, loading, err, refetch: fetchApplications };
}
