import { useState, useEffect, useCallback, useRef } from 'react';
import { authFetch } from '../auth';
import { usePolling } from './usePolling';

// GET /applications — read-only, no side effects (see backend's Pipeline
// orchestration notes: a GET must never create records or enqueue work).
export function useApplications({ status, sort = 'recent', page = 1, limit = 50, enabled = true } = {}) {
  const [applications, setApplications] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // Abort-on-supersede (same pattern as useJobs.js): without this, switching
  // buckets fast enough that the OLD request resolves after the NEW one
  // overwrites applications with stale data — the tab label is right but the
  // list shown is for whatever bucket you were on a moment ago.
  const abortRef = useRef(null);

  const fetchApplications = useCallback(async () => {
    if (!enabled) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const params = new URLSearchParams({ sort, page, limit });
      if (status) params.set('status', status);
      const res = await authFetch(`/applications?${params.toString()}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setApplications(data.applications);
      setTotal(data.total);
      setErr(null);
    } catch (e) {
      if (e.name === 'AbortError') return;
      setErr(e.message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [status, sort, page, limit, enabled]);

  useEffect(() => {
    setLoading(true);
    fetchApplications();
  }, [fetchApplications]);

  usePolling(fetchApplications, 60_000, enabled);

  return { applications, total, loading, err, refetch: fetchApplications };
}
