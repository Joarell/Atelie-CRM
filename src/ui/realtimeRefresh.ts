// Minimal poll wrapper for live views: fires immediately, then on the
// interval, never overlapping a slow tick, and stops on dispose. No DOM —
// the caller decides whether a tick deserves a redraw (the inbox reloads
// the WAHA-fed caches and only re-renders when their snapshot changes,
// so typing in the composer is never interrupted).

export function startRealtimeRefresh(
  refresh: () => Promise<void>,
  intervalMs = 5000
): () => void {
  let disposed = false;
  let running = false;
  const tick = async (): Promise<void> => {
    if (disposed || running) return;
    running = true;
    try {
      await refresh();
    } finally {
      running = false;
    }
  };
  const id = setInterval(() => void tick(), intervalMs);
  void tick();
  return () => {
    disposed = true;
    clearInterval(id);
  };
}