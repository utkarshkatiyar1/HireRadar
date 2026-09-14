import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../auth';
import { usePolling } from './usePolling';

// GET /applications/counts — the single cheap aggregate the Sidebar badge,
// ApprovalQueuePage header, and anywhere else a count is shown all read
// from, instead of each independently hitting GET /applications.
export function useApplicationCounts({ enabled = true } = {}) {
  const [counts, setCounts] = useState({ needsAction: 0, readyForApproval: 0, applying: 0, submittedToday: 0 });

  const fetchCounts = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await authFetch('/applications/counts');
      if (res.ok) setCounts(await res.json());
    } catch {}
  }, [enabled]);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);
  usePolling(fetchCounts, 60_000, enabled);

  return counts;
}
