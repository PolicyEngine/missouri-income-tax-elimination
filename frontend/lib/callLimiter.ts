/**
 * Spaces out calls so that at most a given number start in any window of
 * time. Calls wait their turn in the order they asked.
 */

/** Waits, or rejects with the signal's reason when it is aborted first. */
export function waitFor(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export interface CallLimiter {
  /**
   * Resolves when a call may start, and counts it from then; rejects with
   * the signal's reason if the signal is aborted while waiting.
   */
  acquire(signal?: AbortSignal): Promise<void>;
  /** Forgets every call started so far. */
  clear(): void;
}

export function createCallLimiter(
  callsPerWindow: number,
  windowMilliseconds: number,
): CallLimiter {
  let startTimes: number[] = [];
  // Each caller waits for the previous one, so calls start in order.
  let previousTurn: Promise<void> = Promise.resolve();

  async function waitForSlot(signal?: AbortSignal): Promise<void> {
    for (;;) {
      if (signal?.aborted) {
        throw signal.reason;
      }
      const now = Date.now();
      startTimes = startTimes.filter(
        (startTime) => now - startTime < windowMilliseconds,
      );
      if (startTimes.length < callsPerWindow) {
        startTimes.push(now);
        return;
      }
      await waitFor(startTimes[0] + windowMilliseconds - now, signal);
    }
  }

  return {
    acquire(signal?: AbortSignal): Promise<void> {
      const turn = previousTurn.then(() => waitForSlot(signal));
      previousTurn = turn.catch(() => undefined);
      return turn;
    },
    clear(): void {
      startTimes = [];
    },
  };
}
