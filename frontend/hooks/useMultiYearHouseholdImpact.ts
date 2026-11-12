'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  DashboardApiFailure,
  RATE_LIMIT_PAUSE_MILLISECONDS,
} from '@/lib/api';
import { FETCH_CONCURRENCY, REFORM_YEARS } from '@/lib/constants';
import type { HouseholdRequest, HouseholdImpactResponse } from '@/lib/types';

export interface YearHouseholdImpact {
  year: number;
  status: 'pending' | 'computing' | 'ok' | 'error';
  data?: HouseholdImpactResponse;
  error?: string;
}

/** Synthesise a flat zero-impact response so years where the reform
 *  leaves every bracket at its 2025 baseline can render the chart
 *  without firing a /us/calculate request. Two-point arrays are enough
 *  for ImpactAnalysis to draw a flat zero line. */
function zeroHouseholdImpact(
  maxEarnings: number,
): HouseholdImpactResponse {
  const xMax = Math.max(maxEarnings, 1);
  return {
    income_range: [0, xMax],
    net_income_change: [0, 0],
    federalTaxChange: [0, 0],
    stateTaxChange: [0, 0],
    netIncomeChange: [0, 0],
    benefit_at_income: {
      baseline: 0,
      reform: 0,
      difference: 0,
      federal_tax_change: 0,
      state_tax_change: 0,
      net_income_change: 0,
    },
    x_axis_max: xMax,
  };
}

/**
 * When the page may calculate households again after a refusal for the
 * firewall's limit, in `Date.now()` milliseconds.
 */
let householdCalculationsPausedUntil = 0;
const pauseListeners = new Set<() => void>();

/**
 * Stops the page from starting household calculations for `milliseconds`
 * (a minute unless given); 0 ends a pause.
 */
export function pauseHouseholdCalculations(
  milliseconds: number = RATE_LIMIT_PAUSE_MILLISECONDS,
): void {
  householdCalculationsPausedUntil = Date.now() + milliseconds;
  pauseListeners.forEach((listener) => listener());
}

/** Milliseconds until the page may calculate households again; 0 when it may now. */
export function householdCalculationPauseRemaining(): number {
  return Math.max(0, householdCalculationsPausedUntil - Date.now());
}

/**
 * Whole seconds until the page may calculate households again, 0 when it
 * may now. Counts down once a second during a pause.
 */
export function useHouseholdCalculationPause(): number {
  const [secondsRemaining, setSecondsRemaining] = useState(() =>
    Math.ceil(householdCalculationPauseRemaining() / 1000),
  );
  useEffect(() => {
    let countdown: ReturnType<typeof setInterval> | undefined;
    const update = () => {
      const seconds = Math.ceil(householdCalculationPauseRemaining() / 1000);
      setSecondsRemaining(seconds);
      if (seconds > 0 && countdown === undefined) {
        countdown = setInterval(update, 1000);
      } else if (seconds === 0 && countdown !== undefined) {
        clearInterval(countdown);
        countdown = undefined;
      }
    };
    update();
    pauseListeners.add(update);
    return () => {
      pauseListeners.delete(update);
      if (countdown !== undefined) {
        clearInterval(countdown);
      }
    };
  }, []);
  return secondsRemaining;
}

function isRateLimitRefusal(error: unknown): error is DashboardApiFailure {
  return error instanceof DashboardApiFailure && error.rateLimited;
}

/** A finished run: the household it calculated and each year's result. */
interface HouseholdRun {
  baseRequest: Omit<HouseholdRequest, 'year'>;
  years: YearHouseholdImpact[];
}

async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const i = next++;
        await worker(items[i]);
      }
    },
  );
  await Promise.all(runners);
}

export function useMultiYearHouseholdImpact() {
  const [years, setYears] = useState<YearHouseholdImpact[]>([]);
  const [running, setRunning] = useState(false);
  // The household whose results `years` holds.
  const [shownBaseRequest, setShownBaseRequest] = useState<Omit<
    HouseholdRequest,
    'year'
  > | null>(null);
  // Set when the firewall's limit refused a run and `years` holds the last
  // finished run instead: why, to show above it.
  const [rateLimitNotice, setRateLimitNotice] = useState<string | null>(null);
  // The run in progress. A new run cancels it, so its remaining years are
  // not calculated and its late answers are ignored.
  const runRef = useRef<AbortController | null>(null);
  // The last run that finished, shown again after a refusal for the
  // firewall's limit.
  const lastFinishedRunRef = useRef<HouseholdRun | null>(null);

  /**
   * Starts a run, unless household calculations are paused after a refusal
   * for the firewall's limit; returns whether it started.
   */
  const run = useCallback(
    async (
      baseRequest: Omit<HouseholdRequest, 'year'>,
      reform: Record<string, Record<string, number | boolean>> = {},
      unchangedYears?: Set<number>,
    ): Promise<boolean> => {
      if (householdCalculationPauseRemaining() > 0) {
        return false;
      }
      runRef.current?.abort();
      const controller = new AbortController();
      runRef.current = controller;
      setRunning(true);
      setRateLimitNotice(null);
      setShownBaseRequest(baseRequest);
      // Years where every bracket equals baseline get a synthesised
      // zero-impact payload up front; remaining years go through the
      // normal /us/calculate path.
      const zero = zeroHouseholdImpact(baseRequest.max_earnings);
      const results = new Map<number, YearHouseholdImpact>(
        REFORM_YEARS.map((y) => [
          y,
          unchangedYears?.has(y)
            ? { year: y, status: 'ok' as const, data: zero }
            : { year: y, status: 'computing' as const },
        ]),
      );
      const resultYears = () => REFORM_YEARS.map((y) => results.get(y)!);
      setYears(resultYears());

      // After a refusal for the firewall's limit: the last finished run
      // stays on screen with the reason, or, with no earlier run, the
      // unanswered years show the refusal.
      const showRefusal = (refusal: DashboardApiFailure) => {
        const lastRun = lastFinishedRunRef.current;
        if (lastRun !== null) {
          setYears(lastRun.years);
          setShownBaseRequest(lastRun.baseRequest);
          setRateLimitNotice(refusal.message);
        } else {
          setYears(
            resultYears().map((result) =>
              result.status === 'ok'
                ? result
                : { year: result.year, status: 'error', error: refusal.message },
            ),
          );
        }
        setRunning(false);
      };

      const yearsToFire = REFORM_YEARS.filter((y) => !unchangedYears?.has(y));
      await runWithConcurrency(yearsToFire, FETCH_CONCURRENCY, async (y) => {
        if (controller.signal.aborted) return;
        try {
          const data = await api.calculateHouseholdImpact(
            { ...baseRequest, year: y },
            reform,
            controller.signal,
          );
          if (controller.signal.aborted) return;
          results.set(y, { year: y, status: 'ok', data });
          setYears(resultYears());
        } catch (e) {
          if (controller.signal.aborted) return;
          if (isRateLimitRefusal(e)) {
            // Everyone on the network shares the limit: send nothing more
            // for a minute, and stop this run's other calculations.
            pauseHouseholdCalculations();
            controller.abort();
            showRefusal(e);
            return;
          }
          const message = e instanceof Error ? e.message : 'Unknown error';
          results.set(y, { year: y, status: 'error', error: message });
          setYears(resultYears());
        }
      });

      if (!controller.signal.aborted) {
        lastFinishedRunRef.current = { baseRequest, years: resultYears() };
        setRunning(false);
      }
      return true;
    },
    [],
  );

  const runYear = useCallback(
    async (
      year: number,
      baseRequest: Omit<HouseholdRequest, 'year'>,
      reform: Record<string, Record<string, number | boolean>> = {},
      unchangedYears?: Set<number>,
    ) => {
      if (householdCalculationPauseRemaining() > 0) {
        return;
      }
      // Short-circuit baseline-equal years with a synthetic zero so the
      // chart can rerender against the new max_earnings without a fetch.
      if (unchangedYears?.has(year)) {
        const zero = zeroHouseholdImpact(baseRequest.max_earnings);
        setYears((prev) =>
          prev.map((p) =>
            p.year === year ? { year, status: 'ok', data: zero } : p,
          ),
        );
        return;
      }
      // Mark just this year as computing (keep other years as-is).
      let previousResult: YearHouseholdImpact | undefined;
      setYears((prev) =>
        prev.map((p) => {
          if (p.year !== year) return p;
          previousResult = p;
          return { ...p, status: 'computing', error: undefined };
        }),
      );
      try {
        const data = await api.calculateHouseholdImpact(
          { ...baseRequest, year },
          reform,
        );
        setYears((prev) =>
          prev.map((p) =>
            p.year === year ? { year, status: 'ok', data } : p,
          ),
        );
      } catch (e) {
        if (isRateLimitRefusal(e)) {
          // Keep the year's earlier result, and send nothing for a minute.
          pauseHouseholdCalculations();
          setRateLimitNotice(e.message);
          setYears((prev) =>
            prev.map((p) =>
              p.year === year && previousResult !== undefined ? previousResult : p,
            ),
          );
          return;
        }
        const message = e instanceof Error ? e.message : 'Unknown error';
        setYears((prev) =>
          prev.map((p) =>
            p.year === year ? { year, status: 'error', error: message } : p,
          ),
        );
      }
    },
    [],
  );

  const reset = useCallback(() => {
    runRef.current?.abort();
    runRef.current = null;
    setYears([]);
    setRunning(false);
    setRateLimitNotice(null);
  }, []);

  return {
    years,
    running,
    shownBaseRequest,
    rateLimitNotice,
    run,
    runYear,
    reset,
  };
}
