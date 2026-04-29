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

const YEARS = [
  2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035,
] as const;

export function useMultiYearHouseholdImpact() {
  const [years, setYears] = useState<YearHouseholdImpact[]>([]);
  const [running, setRunning] = useState(false);

  const run = useCallback(
    async (
      baseRequest: Omit<HouseholdRequest, 'year'>,
      reform: Record<string, Record<string, number | boolean>> = {},
    ) => {
      setRunning(true);
      setYears(
        YEARS.map((y) => ({ year: y, status: 'computing' as const })),
      );

      // Run all years in parallel. Each year's setState fires as its
      // simulation finishes, so the chart streams in progressively.
      await Promise.all(
        YEARS.map(async (y) => {
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
    ) => {
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
