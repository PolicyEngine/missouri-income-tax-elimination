import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { useMultiYearHouseholdImpact } from '@/hooks/useMultiYearHouseholdImpact';
import type { HouseholdImpactResponse, HouseholdRequest } from '@/lib/types';

interface PendingCalculation {
  year: number;
  signal: AbortSignal | undefined;
  resolve: (impact: HouseholdImpactResponse) => void;
}

// Household calculations that answer only when a test resolves them.
const { pendingCalculations } = vi.hoisted(() => ({
  pendingCalculations: [] as PendingCalculation[],
}));

vi.mock('@/lib/api', () => ({
  api: {
    calculateHouseholdImpact: (
      request: HouseholdRequest,
      _reform: unknown,
      signal?: AbortSignal,
    ) =>
      new Promise<HouseholdImpactResponse>((resolve) => {
        pendingCalculations.push({ year: request.year, signal, resolve });
      }),
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HouseholdImpactHook = ReturnType<typeof useMultiYearHouseholdImpact>;

function renderHouseholdImpactHook() {
  const latest: { hook?: HouseholdImpactHook } = {};
  function Probe() {
    latest.hook = useMultiYearHouseholdImpact();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe />));
  return { latest, root };
}

const baseRequest: Omit<HouseholdRequest, 'year'> = {
  age_head: 35,
  age_spouse: null,
  dependent_ages: [5],
  income: 50000,
  max_earnings: 400000,
  state_code: 'MO',
};
const reform = {
  'gov.states.mo.tax.income.rates.rates[7].rate': { '2027-01-01.2100-12-31': 0 },
};
const impact: HouseholdImpactResponse = {
  income_range: [0, 400000],
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
  x_axis_max: 400000,
};

describe('useMultiYearHouseholdImpact', () => {
  it('stops the previous run when a new run starts', async () => {
    const { latest, root } = renderHouseholdImpactHook();

    await act(async () => {
      void latest.hook!.run(baseRequest, reform);
    });
    // Four years at a time.
    const firstRun = [...pendingCalculations];
    expect(firstRun).toHaveLength(4);

    // "Done" again, for example after changing the reform.
    await act(async () => {
      void latest.hook!.run(baseRequest, reform);
    });
    expect(firstRun.every((calculation) => calculation.signal?.aborted === true)).toBe(true);
    expect(pendingCalculations).toHaveLength(8);

    // The first run's answers arrive late: they start no more calculations
    // and do not replace the new run's years.
    await act(async () => {
      firstRun.forEach((calculation) => calculation.resolve(impact));
    });
    expect(pendingCalculations).toHaveLength(8);
    expect(latest.hook!.years.filter((year) => year.status === 'ok')).toEqual([]);

    act(() => root.unmount());
  });
});
