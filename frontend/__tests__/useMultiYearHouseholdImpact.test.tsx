import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  householdCalculationPauseRemaining,
  pauseHouseholdCalculations,
  useMultiYearHouseholdImpact,
} from '@/hooks/useMultiYearHouseholdImpact';
import { DashboardApiFailure } from '@/lib/api';
import type { HouseholdImpactResponse, HouseholdRequest } from '@/lib/types';

interface PendingCalculation {
  year: number;
  signal: AbortSignal | undefined;
  resolve: (impact: HouseholdImpactResponse) => void;
  reject: (error: unknown) => void;
}

// Household calculations that answer only when a test resolves them.
const { pendingCalculations } = vi.hoisted(() => ({
  pendingCalculations: [] as PendingCalculation[],
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  api: {
    calculateHouseholdImpact: (
      request: HouseholdRequest,
      _reform: unknown,
      signal?: AbortSignal,
    ) =>
      new Promise<HouseholdImpactResponse>((resolve, reject) => {
        pendingCalculations.push({ year: request.year, signal, resolve, reject });
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

function rateLimitRefusal(): DashboardApiFailure {
  return new DashboardApiFailure(
    'Everyone on your network, such as a workshop or an office, shares a ' +
      'limit on calculations a minute, and it has been reached.',
    429,
    true,
  );
}

function impactOf(difference: number): HouseholdImpactResponse {
  return {
    ...impact,
    benefit_at_income: { ...impact.benefit_at_income, difference },
  };
}

/** Answers every calculation started so far, and the ones they lead to. */
async function answerAllCalculations(difference: number): Promise<void> {
  for (let round = 0; round < 10; round += 1) {
    const unanswered = pendingCalculations.splice(0);
    if (unanswered.length === 0) {
      return;
    }
    await act(async () => {
      unanswered.forEach((calculation) => calculation.resolve(impactOf(difference)));
    });
  }
}

afterEach(() => {
  pendingCalculations.splice(0);
  vi.useRealTimers();
  pauseHouseholdCalculations(0);
});

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

  it("keeps the last run's results on screen after a rate-limit refusal", async () => {
    const { latest, root } = renderHouseholdImpactHook();
    await act(async () => {
      void latest.hook!.run(baseRequest, reform);
    });
    await answerAllCalculations(100);
    const lastRunYears = latest.hook!.years;
    expect(lastRunYears.every((year) => year.status === 'ok')).toBe(true);

    // "Done" with a new household; the firewall refuses its first answer.
    const newRequest = { ...baseRequest, income: 80000 };
    await act(async () => {
      void latest.hook!.run(newRequest, reform);
    });
    const secondRun = pendingCalculations.splice(0);
    await act(async () => {
      secondRun[0].reject(rateLimitRefusal());
    });

    expect(latest.hook!.years).toEqual(lastRunYears);
    expect(latest.hook!.shownBaseRequest).toEqual(baseRequest);
    expect(latest.hook!.rateLimitNotice).toBe(rateLimitRefusal().message);
    expect(latest.hook!.running).toBe(false);
    // The rest of the run stops: no further calculation starts.
    expect(secondRun.slice(1).every((calculation) => calculation.signal?.aborted === true)).toBe(true);
    expect(pendingCalculations).toEqual([]);

    act(() => root.unmount());
  });

  it('pauses household calculations for a minute after a rate-limit refusal', async () => {
    vi.useFakeTimers();
    const { latest, root } = renderHouseholdImpactHook();
    await act(async () => {
      void latest.hook!.run(baseRequest, reform);
    });
    await act(async () => {
      pendingCalculations.splice(0)[0].reject(rateLimitRefusal());
    });
    expect(householdCalculationPauseRemaining()).toBe(60_000);

    // "Done" again within the minute sends nothing.
    let started: boolean | undefined;
    await act(async () => {
      started = await latest.hook!.run(baseRequest, reform);
    });
    expect(started).toBe(false);
    expect(pendingCalculations).toEqual([]);

    vi.advanceTimersByTime(60_000);
    await act(async () => {
      void latest.hook!.run(baseRequest, reform);
    });
    expect(pendingCalculations).toHaveLength(4);

    act(() => root.unmount());
  });

  it('shows the refusal for unanswered years when nothing was calculated before', async () => {
    const { latest, root } = renderHouseholdImpactHook();
    await act(async () => {
      void latest.hook!.run(baseRequest, reform);
    });
    const firstCalculations = pendingCalculations.splice(0);
    await act(async () => {
      firstCalculations[1].resolve(impactOf(100));
    });
    await act(async () => {
      firstCalculations[0].reject(rateLimitRefusal());
    });

    const years = latest.hook!.years;
    expect(years.filter((year) => year.status === 'ok').map((year) => year.year)).toEqual([
      firstCalculations[1].year,
    ]);
    expect(
      years
        .filter((year) => year.status !== 'ok')
        .every((year) => year.status === 'error' && year.error === rateLimitRefusal().message),
    ).toBe(true);
    expect(latest.hook!.rateLimitNotice).toBeNull();
    expect(latest.hook!.running).toBe(false);

    act(() => root.unmount());
  });

  it('keeps other failures when a refusal arrives with no earlier run', async () => {
    const { latest, root } = renderHouseholdImpactHook();
    await act(async () => {
      void latest.hook!.run(baseRequest, reform);
    });
    const firstCalculations = pendingCalculations.splice(0);
    const serverFailure = new DashboardApiFailure(
      'PolicyEngine could not calculate this household (HTTP 500): Internal error',
      500,
    );
    await act(async () => {
      firstCalculations[1].reject(serverFailure);
    });
    await act(async () => {
      firstCalculations[0].reject(rateLimitRefusal());
    });

    expect(
      latest.hook!.years.find((year) => year.year === firstCalculations[1].year),
    ).toEqual({
      year: firstCalculations[1].year,
      status: 'error',
      error: serverFailure.message,
    });

    act(() => root.unmount());
  });

  it('stops the run when the page that started it goes away', async () => {
    const { latest, root } = renderHouseholdImpactHook();
    await act(async () => {
      void latest.hook!.run(baseRequest, reform);
    });
    const calculations = pendingCalculations.splice(0);

    act(() => root.unmount());

    expect(calculations.every((calculation) => calculation.signal?.aborted === true)).toBe(true);
  });
});
