import { useEffect } from 'react';

// Shared interval+cleanup helper so this boilerplate isn't hand-rolled in
// every hook that needs to poll.
export function usePolling(callback, intervalMs, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(callback, intervalMs);
    return () => clearInterval(id);
  }, [callback, intervalMs, enabled]);
}
