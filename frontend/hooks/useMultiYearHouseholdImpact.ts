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
      setYears(YEARS.map((y) => ({ year: y, status: 'pending' })));

      await Promise.all(
        YEARS.map(async (y) => {
          setYears((prev) =>
            prev.map((p) =>
              p.year === y ? { ...p, status: 'computing' } : p,
            ),
          );
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

  const reset = useCallback(() => {
    setYears([]);
    setRunning(false);
  }, []);

  return { years, running, run, reset };
}
