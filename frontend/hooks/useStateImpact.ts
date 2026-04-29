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

const YEARS = [
  2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035,
] as const;

export function useStateImpact() {
  const [years, setYears] = useState<YearImpact[]>([]);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (reform: Record<string, Record<string, number | boolean>>) => {
      // Cancel any in-flight run first.
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setRunning(true);
      setYears(YEARS.map((y) => ({ year: y, status: 'pending' })));

      try {
        const policyId = await createPolicy(reform);
        // Mark all as computing up front, then poll all years in parallel.
        // Each year's setState fires independently as its simulation
        // finishes, so results stream in progressively.
        setYears((prev) =>
          prev.map((p) => ({ ...p, status: 'computing' as const })),
        );
        await Promise.all(
          YEARS.map(async (y) => {
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
          }),
        );
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
