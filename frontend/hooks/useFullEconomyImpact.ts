'use client';

import { useCallback, useRef, useState } from 'react';
import { createPolicy, pollEconomicImpact } from '@/lib/api';
import type {
  DecileImpact,
  EconomyImpactResult,
  IntraDecile,
  PovertyImpact,
  IncomeBracket,
} from '@/lib/types';

export interface YearEconomyImpact {
  year: number;
  status: 'pending' | 'computing' | 'ok' | 'error';
  decile?: DecileImpact;
  intra_decile?: IntraDecile;
  poverty?: PovertyImpact;
  by_income_bracket?: IncomeBracket[];
  error?: string;
}

const YEARS = [
  2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035,
] as const;

// Cap parallel /us/economy polls so the hosted API doesn't abort
// requests under load (matches the cap that was in useStateImpact
// before the budget-window batch endpoint replaced it).
const ECONOMY_CONCURRENCY = 3;

/** Empty decile/intra/poverty payload for years where the reform
 * matches the 2025 baseline across every bracket. */
const EMPTY_DECILE: DecileImpact = {
  average: Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [String(i + 1), 0]),
  ),
  relative: Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [String(i + 1), 0]),
  ),
};

const EMPTY_INTRA_DECILE: IntraDecile = {
  all: {
    gain_more_than_5pct: 0,
    gain_less_than_5pct: 0,
    no_change: 1,
    lose_less_than_5pct: 0,
    lose_more_than_5pct: 0,
  },
  deciles: {
    gain_more_than_5pct: Array(10).fill(0),
    gain_less_than_5pct: Array(10).fill(0),
    no_change: Array(10).fill(1),
    lose_less_than_5pct: Array(10).fill(0),
    lose_more_than_5pct: Array(10).fill(0),
  },
};

const EMPTY_POVERTY: PovertyImpact = {
  poverty: {
    all: { baseline: 0, reform: 0 },
    child: { baseline: 0, reform: 0 },
  },
  deep_poverty: {
    all: { baseline: 0, reform: 0 },
    child: { baseline: 0, reform: 0 },
  },
};

async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i]);
    }
  });
  await Promise.all(runners);
}

function extractFromResult(result: EconomyImpactResult): {
  decile?: DecileImpact;
  intra_decile?: IntraDecile;
  poverty?: PovertyImpact;
  by_income_bracket?: IncomeBracket[];
} {
  // PolicyEngine's /us/economy result wraps the fields directly on the
  // top-level object. Some deployments nest them under separate keys —
  // surface both shapes so we don't lose data on a key rename.
  const raw = result as Record<string, unknown>;
  const decile =
    (raw.decile as DecileImpact | undefined) ??
    (raw.decile_impact as DecileImpact | undefined);
  const intra_decile =
    (raw.intra_decile as IntraDecile | undefined) ??
    (raw.intra_decile_impact as IntraDecile | undefined);
  const poverty =
    (raw.poverty as PovertyImpact | undefined) ??
    (raw.poverty_impact as PovertyImpact | undefined);
  const by_income_bracket = raw.by_income_bracket as
    | IncomeBracket[]
    | undefined;
  return { decile, intra_decile, poverty, by_income_bracket };
}

export function useFullEconomyImpact() {
  const [years, setYears] = useState<YearEconomyImpact[]>([]);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (
      reform: Record<string, Record<string, number | boolean>>,
      unchangedYears?: Set<number>,
    ) => {
      // Cancel any in-flight run.
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setRunning(true);

      // Seed every year as pending; unchanged years immediately resolve
      // to the empty payload so the chart can render zeros without a
      // network round trip.
      const initial: YearEconomyImpact[] = YEARS.map((y) =>
        unchangedYears?.has(y)
          ? {
              year: y,
              status: 'ok',
              decile: EMPTY_DECILE,
              intra_decile: EMPTY_INTRA_DECILE,
              poverty: EMPTY_POVERTY,
              by_income_bracket: [],
            }
          : { year: y, status: 'pending' },
      );
      setYears(initial);

      const yearsToFire = YEARS.filter((y) => !unchangedYears?.has(y));
      if (yearsToFire.length === 0) {
        setRunning(false);
        return;
      }

      try {
        const policyId = await createPolicy(reform);

        // Mark the network-bound years as computing up front.
        setYears((prev) =>
          prev.map((p) =>
            unchangedYears?.has(p.year)
              ? p
              : { ...p, status: 'computing' as const },
          ),
        );

        await runWithConcurrency(yearsToFire, ECONOMY_CONCURRENCY, async (y) => {
          if (controller.signal.aborted) return;
          try {
            const result = await pollEconomicImpact(
              policyId,
              y,
              undefined,
              controller.signal,
            );
            if (controller.signal.aborted) return;
            const extracted = extractFromResult(result);
            setYears((prev) =>
              prev.map((p) =>
                p.year === y
                  ? {
                      year: y,
                      status: 'ok',
                      ...extracted,
                    }
                  : p,
              ),
            );
          } catch (e) {
            if (controller.signal.aborted) return;
            const message = e instanceof Error ? e.message : 'Unknown error';
            setYears((prev) =>
              prev.map((p) =>
                p.year === y
                  ? { year: y, status: 'error', error: message }
                  : p,
              ),
            );
          }
        });
      } catch (e) {
        // createPolicy or batch-runner failure — surface the error on
        // every network-bound year so the UI shows the banner.
        if (!controller.signal.aborted) {
          const message = e instanceof Error ? e.message : 'Unknown error';
          setYears((prev) =>
            prev.map((p) =>
              unchangedYears?.has(p.year)
                ? p
                : { year: p.year, status: 'error', error: message },
            ),
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setRunning(false);
        }
      }
    },
    [],
  );

  const reset = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setYears([]);
    setRunning(false);
  }, []);

  return { years, running, run, reset };
}
