import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCallLimiter } from '@/lib/callLimiter';

afterEach(() => {
  vi.useRealTimers();
});

describe('createCallLimiter', () => {
  it('starts at most the allowed number of calls in a window, in order', async () => {
    vi.useFakeTimers();
    const limiter = createCallLimiter(2, 60_000);
    const started: number[] = [];

    for (const callNumber of [1, 2, 3]) {
      void limiter.acquire().then(() => started.push(callNumber));
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual([1, 2]);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(started).toEqual([1, 2, 3]);
  });

  it('stops waiting when the call is cancelled', async () => {
    vi.useFakeTimers();
    const limiter = createCallLimiter(1, 60_000);
    await limiter.acquire();
    const controller = new AbortController();

    const waiting = limiter.acquire(controller.signal);
    controller.abort(new Error('Cancelled'));

    await expect(waiting).rejects.toThrow('Cancelled');
  });
});
