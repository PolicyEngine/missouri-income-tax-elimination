'use client';

import { useCallback, useRef, useState } from 'react';
import { createPolicy, pollEconomicImpact } from '@/lib/api';
import { FETCH_CONCURRENCY, REFORM_YEARS } from '@/lib/constants';
import type {
  BudgetImpact,
  DecileImpact,
  EconomyImpactResult,
  IntraDecile,
  PovertyImpact,
  IncomeBracket,
} from '@/lib/types';

export interface YearEconomyImpact {
  year: number;
  status: 'pending' | 'computing' | 'ok' | 'error';
  budget?: BudgetImpact;
  decile?: DecileImpact;
  intra_decile?: IntraDecile;
  poverty?: PovertyImpact;
  by_income_bracket?: IncomeBracket[];
  error?: string;
}

/** StateImpact still consumes a hook-local YearImpact alias. Re-export
 *  so existing imports work without each consumer renaming. */
export type YearImpact = YearEconomyImpact;

/** Synthesised zero-impact budget for baseline-equal years — skips the
 *  /us/economy round trip and lets StateImpact draw a flat zero line. */
const ZERO_BUDGET: BudgetImpact = {
  baseline_net_income: 0,
  budgetary_impact: 0,
  federal_tax_revenue_impact: 0,
  state_tax_revenue_impact: 0,
  tax_revenue_impact: 0,
  benefit_spending_impact: 0,
  households: 0,
};

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

const ZERO_YEAR: Omit<YearEconomyImpact, 'year' | 'status'> = {
  budget: ZERO_BUDGET,
  decile: EMPTY_DECILE,
  intra_decile: EMPTY_INTRA_DECILE,
  poverty: EMPTY_POVERTY,
  by_income_bracket: [],
};

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

/** PolicyEngine's /us/economy returns intra-decile buckets keyed by
 *  human-readable strings ("Gain more than 5%"); the rest of the app
 *  speaks snake-case. Translate on the way out. */
const INTRA_KEY_MAP: Record<string, keyof IntraDecile['all']> = {
  'Gain more than 5%': 'gain_more_than_5pct',
  'Gain less than 5%': 'gain_less_than_5pct',
  'No change': 'no_change',
  'Lose less than 5%': 'lose_less_than_5pct',
  'Lose more than 5%': 'lose_more_than_5pct',
};

function normaliseIntraDecile(raw: unknown): IntraDecile | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const rawAll = r.all as Record<string, number> | undefined;
  const rawDeciles = r.deciles as Record<string, number[]> | undefined;
  if (!rawAll || !rawDeciles) return undefined;

  if ('gain_more_than_5pct' in rawAll) {
    return raw as IntraDecile;
  }

  const all = {
    gain_more_than_5pct: 0,
    gain_less_than_5pct: 0,
    no_change: 0,
    lose_less_than_5pct: 0,
    lose_more_than_5pct: 0,
  };
  const deciles: IntraDecile['deciles'] = {
    gain_more_than_5pct: Array(10).fill(0),
    gain_less_than_5pct: Array(10).fill(0),
    no_change: Array(10).fill(0),
    lose_less_than_5pct: Array(10).fill(0),
    lose_more_than_5pct: Array(10).fill(0),
  };
  for (const [raw_key, snake_key] of Object.entries(INTRA_KEY_MAP)) {
    if (typeof rawAll[raw_key] === 'number') {
      all[snake_key] = rawAll[raw_key];
    }
    const decile_values = rawDeciles[raw_key];
    if (Array.isArray(decile_values) && decile_values.length === 10) {
      deciles[snake_key] = decile_values.slice() as number[];
    }
  }
  return { all, deciles };
}

function extractFromResult(result: EconomyImpactResult): {
  budget?: BudgetImpact;
  decile?: DecileImpact;
  intra_decile?: IntraDecile;
  poverty?: PovertyImpact;
  by_income_bracket?: IncomeBracket[];
} {
  const raw = result as Record<string, unknown>;
  const budget = raw.budget as BudgetImpact | undefined;
  const decile =
    (raw.decile as DecileImpact | undefined) ??
    (raw.decile_impact as DecileImpact | undefined);
  const intra_decile = normaliseIntraDecile(
    raw.intra_decile ?? raw.intra_decile_impact,
  );
  const poverty =
    (raw.poverty as PovertyImpact | undefined) ??
    (raw.poverty_impact as PovertyImpact | undefined);
  const by_income_bracket = raw.by_income_bracket as
    | IncomeBracket[]
    | undefined;
  return { budget, decile, intra_decile, poverty, by_income_bracket };
}

/**
 * Single per-year /us/economy poll feeds all four statewide tabs —
 * Budgetary (budget), Distributional (decile), Winners & losers
 * (intra_decile), Poverty (poverty). Previously useStateImpact and
 * useFullEconomyImpact each fired their own batch, doubling the API
 * load for identical years.
 */
export function useEconomyImpact() {
  const [years, setYears] = useState<YearEconomyImpact[]>([]);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (
      reform: Record<string, Record<string, number | boolean>>,
      unchangedYears?: Set<number>,
    ) => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setRunning(true);

      const initial: YearEconomyImpact[] = REFORM_YEARS.map((y) =>
        unchangedYears?.has(y)
          ? { year: y, status: 'ok', ...ZERO_YEAR }
          : { year: y, status: 'pending' },
      );
      setYears(initial);

      const yearsToFire = REFORM_YEARS.filter((y) => !unchangedYears?.has(y));
      if (yearsToFire.length === 0) {
        setRunning(false);
        return;
      }

      try {
        const policyId = await createPolicy(reform);

        setYears((prev) =>
          prev.map((p) =>
            unchangedYears?.has(p.year)
              ? p
              : { ...p, status: 'computing' as const },
          ),
        );

        await runWithConcurrency(yearsToFire, FETCH_CONCURRENCY, async (y) => {
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
                p.year === y ? { year: y, status: 'ok', ...extracted } : p,
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
