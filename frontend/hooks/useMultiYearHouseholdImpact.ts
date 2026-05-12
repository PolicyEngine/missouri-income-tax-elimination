'use client';

import { useCallback, useState } from 'react';
import { api } from '@/lib/api';
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

const YEARS = [
  2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035,
] as const;

// /us/calculate is the household endpoint — stateless and lightweight,
// not routed through the Modal simulation gateway that motivated the
// original concurrency cap. Fire all years in parallel so the chart
// fills in 1-2 seconds instead of 6-8.

export function useMultiYearHouseholdImpact() {
  const [years, setYears] = useState<YearHouseholdImpact[]>([]);
  const [running, setRunning] = useState(false);

  const run = useCallback(
    async (
      baseRequest: Omit<HouseholdRequest, 'year'>,
      reform: Record<string, Record<string, number | boolean>> = {},
      unchangedYears?: Set<number>,
    ) => {
      setRunning(true);
      // Years where every bracket equals baseline get a synthesised
      // zero-impact payload up front; remaining years go through the
      // normal /us/calculate path.
      const zero = zeroHouseholdImpact(baseRequest.max_earnings);
      setYears(
        YEARS.map((y) =>
          unchangedYears?.has(y)
            ? { year: y, status: 'ok' as const, data: zero }
            : { year: y, status: 'computing' as const },
        ),
      );

      const yearsToFire = YEARS.filter((y) => !unchangedYears?.has(y));
      await Promise.all(
        yearsToFire.map(async (y) => {
          try {
            const data = await api.calculateHouseholdImpact(
              { ...baseRequest, year: y },
              reform,
            );
            setYears((prev) =>
              prev.map((p) =>
                p.year === y ? { year: y, status: 'ok', data } : p,
              ),
            );
          } catch (e) {
            const message = e instanceof Error ? e.message : 'Unknown error';
            setYears((prev) =>
              prev.map((p) =>
                p.year === y
                  ? { year: y, status: 'error', error: message }
                  : p,
              ),
            );
          }
        }),
      );

      setRunning(false);
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
      setYears((prev) =>
        prev.map((p) =>
          p.year === year ? { ...p, status: 'computing', error: undefined } : p,
        ),
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
    setYears([]);
    setRunning(false);
  }, []);

  return { years, running, run, runYear, reset };
}
