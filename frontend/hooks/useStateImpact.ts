'use client';

import { useCallback, useRef, useState } from 'react';
import {
  createPolicy,
  pollBudgetWindowImpact,
  type AnnualBudgetImpact,
  type BudgetWindowProgress,
} from '@/lib/api';
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

/** Map a server-side AnnualBudgetImpact (camelCase) onto the
 *  snake-case BudgetImpact the rest of the app already consumes. */
function toBudgetImpact(annual: AnnualBudgetImpact): BudgetImpact {
  return {
    baseline_net_income: 0,
    budgetary_impact: annual.budgetaryImpact,
    federal_tax_revenue_impact: annual.federalTaxRevenueImpact,
    state_tax_revenue_impact: annual.stateTaxRevenueImpact,
    tax_revenue_impact: annual.taxRevenueImpact,
    benefit_spending_impact: annual.benefitSpendingImpact,
    households: 0,
  };
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
      if (unchangedYears) {
        setYears((prev) =>
          prev.map((p) =>
            unchangedYears.has(p.year)
              ? { year: p.year, status: 'ok', budget: ZERO_BUDGET }
              : p,
          ),
        );
      }

      // Empty reform after stripping baseline-equal cells: every year is
      // a no-op, skip the network entirely.
      const yearsToFire = YEARS.filter((y) => !unchangedYears?.has(y));
      if (yearsToFire.length === 0) {
        setRunning(false);
        return;
      }

      try {
        const policyId = await createPolicy(reform);

        // Mark remaining years as computing immediately. The batch
        // endpoint takes the full window and queues every year
        // server-side, so we don't slice into contiguous ranges — any
        // unchanged-year cache hits resolve fast on the server.
        setYears((prev) =>
          prev.map((p) =>
            unchangedYears?.has(p.year)
              ? p
              : { ...p, status: 'computing' as const },
          ),
        );

        const startYear = YEARS[0];
        const windowSize = YEARS.length;
        const onProgress = (progress: BudgetWindowProgress) => {
          if (controller.signal.aborted) return;
          // Surface server-reported status arrays as best-effort
          // year-level state. The server doesn't return per-year
          // payloads until the whole batch is done, so we only flip
          // status badges here — the budget data fills in once the
          // batch resolves below.
          const completed = new Set(progress.completed_years.map(Number));
          const computing = new Set(progress.computing_years.map(Number));
          const queued = new Set(progress.queued_years.map(Number));
          setYears((prev) =>
            prev.map((p) => {
              if (unchangedYears?.has(p.year)) return p;
              if (computing.has(p.year)) {
                return { ...p, status: 'computing' as const };
              }
              if (queued.has(p.year)) {
                return { ...p, status: 'pending' as const };
              }
              if (completed.has(p.year) && !p.budget) {
                // Server has finished this year but the aggregate
                // result hasn't returned yet; keep as computing so the
                // chart only renders once we have actual numbers.
                return { ...p, status: 'computing' as const };
              }
              return p;
            }),
          );
        };

        const result = await pollBudgetWindowImpact(
          policyId,
          startYear,
          windowSize,
          onProgress,
          controller.signal,
        );
        if (controller.signal.aborted) return;

        const annualByYear = new Map<number, AnnualBudgetImpact>();
        for (const annual of result.annualImpacts) {
          annualByYear.set(Number(annual.year), annual);
        }

        setYears((prev) =>
          prev.map((p) => {
            if (unchangedYears?.has(p.year)) return p;
            const annual = annualByYear.get(p.year);
            if (!annual) {
              return {
                year: p.year,
                status: 'error',
                error: 'No data returned for year',
              };
            }
            return {
              year: p.year,
              status: 'ok',
              budget: toBudgetImpact(annual),
            };
          }),
        );
      } catch (e) {
        if (controller.signal.aborted) return;
        const message = e instanceof Error ? e.message : 'Unknown error';
        setYears((prev) =>
          prev.map((p) =>
            unchangedYears?.has(p.year)
              ? p
              : { year: p.year, status: 'error', error: message },
          ),
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
