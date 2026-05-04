'use client';

import { useCallback, useRef, useState } from 'react';
import { createPolicy, pollEconomicImpact } from '@/lib/api';
import type { BudgetImpact } from '@/lib/types';

export interface YearImpact {
  year: number;
  status: 'pending' | 'computing' | 'ok' | 'error';
  budget?: BudgetImpact;
  error?: string;
}

/** Synthesised zero-impact budget for years where the reform leaves every
 * bracket at its 2025 baseline. Saves a /us/economy round trip per year. */
const ZERO_BUDGET: BudgetImpact = {
  baseline_net_income: 0,
  budgetary_impact: 0,
  federal_tax_revenue_impact: 0,
  state_tax_revenue_impact: 0,
  tax_revenue_impact: 0,
  benefit_spending_impact: 0,
  households: 0,
};

const YEARS = [
  2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035,
] as const;

// Cap simultaneous /us/economy polls so the API doesn't abort requests
// under load.
const STATE_CONCURRENCY = 3;

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

export function useStateImpact() {
  const [years, setYears] = useState<YearImpact[]>([]);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (
      reform: Record<string, Record<string, number | boolean>>,
      unchangedYears?: Set<number>,
    ) => {
      // Cancel any in-flight run first.
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setRunning(true);
      setYears(YEARS.map((y) => ({ year: y, status: 'pending' })));

      // Years that match the 2025 baseline across every bracket short-circuit
      // to a zero-impact budget — no sim fires.
      const yearsToFire = YEARS.filter((y) => !unchangedYears?.has(y));
      if (unchangedYears) {
        setYears((prev) =>
          prev.map((p) =>
            unchangedYears.has(p.year)
              ? { year: p.year, status: 'ok', budget: ZERO_BUDGET }
              : p,
          ),
        );
      }

      // Empty reform after stripping baseline-equal cells: every year is a
      // no-op, skip the network entirely.
      if (yearsToFire.length === 0) {
        setRunning(false);
        return;
      }

      try {
        const policyId = await createPolicy(reform);
        // Mark remaining years as computing, then poll with bounded
        // concurrency. Each year's setState fires independently as its
        // simulation finishes, so results stream in progressively.
        setYears((prev) =>
          prev.map((p) =>
            unchangedYears?.has(p.year)
              ? p
              : { ...p, status: 'computing' as const },
          ),
        );
        await runWithConcurrency(yearsToFire, STATE_CONCURRENCY, async (y) => {
          if (controller.signal.aborted) return;
          try {
            const result = await pollEconomicImpact(
              policyId,
              y,
              undefined,
              controller.signal,
            );
            if (controller.signal.aborted) return;
            setYears((prev) =>
              prev.map((p) =>
                p.year === y
                  ? {
                      year: y,
                      status: 'ok',
                      budget: result.budget as BudgetImpact,
                    }
                  : p,
              ),
            );
          } catch (e) {
            if (controller.signal.aborted) return;
            const message =
              e instanceof Error ? e.message : 'Unknown error';
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
        // createPolicy failed — mark everything as error.
        const message = e instanceof Error ? e.message : 'Unknown error';
        setYears((prev) =>
          prev.map((p) => ({ ...p, status: 'error', error: message })),
        );
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
