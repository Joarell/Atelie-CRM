import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startRealtimeRefresh } from '../../src/ui/realtimeRefresh';

describe('startRealtimeRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes immediately and then on the interval', async () => {
    const refresh = vi.fn(async () => {});
    const dispose = startRealtimeRefresh(refresh, 1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(refresh).toHaveBeenCalledTimes(3);
    dispose();
  });

  it('skips ticks that overlap a still-running refresh', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const refresh = vi.fn(async () => {
      await gate;
    });
    const dispose = startRealtimeRefresh(refresh, 1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(refresh).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    dispose();
  });

  it('stops polling after dispose', async () => {
    const refresh = vi.fn(async () => {});
    const dispose = startRealtimeRefresh(refresh, 1000);
    await vi.advanceTimersByTimeAsync(0);
    dispose();
    await vi.advanceTimersByTimeAsync(4000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});