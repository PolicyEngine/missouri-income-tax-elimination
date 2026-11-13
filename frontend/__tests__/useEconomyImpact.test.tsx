import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useEconomyImpact } from '@/hooks/useEconomyImpact';
import { DashboardApiFailure } from '@/lib/api';
import { REFORM_YEARS } from '@/lib/constants';
import type { EconomyImpactResult } from '@/lib/types';

interface PendingRead {
  year: number;
  signal: AbortSignal | undefined;
  resolve: (result: EconomyImpactResult) => void;
  reject: (error: unknown) => void;
}

// Statewide reads that answer only when a test resolves them; every read
// the hook starts stays in this list.
const { startedReads } = vi.hoisted(() => ({
  startedReads: [] as PendingRead[],
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  createPolicy: async () => 98765,
  pollEconomicImpact: (
    _policyId: number,
    year: number,
    _onUpdate: unknown,
    signal?: AbortSignal,
  ) =>
    new Promise<EconomyImpactResult>((resolve, reject) => {
      startedReads.push({ year, signal, resolve, reject });
    }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type EconomyImpactHook = ReturnType<typeof useEconomyImpact>;

function renderEconomyImpactHook() {
  const latest: { hook?: EconomyImpactHook } = {};
  function Probe() {
    latest.hook = useEconomyImpact();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe />));
  return { latest, root };
}

const reform = {
  'gov.states.mo.tax.income.rates.rates[7].rate': { '2027-01-01.2100-12-31': 0 },
};

const statewideResult: EconomyImpactResult = {
  budget: {
    baseline_net_income: 0,
    budgetary_impact: -1_000_000,
    federal_tax_revenue_impact: 0,
    state_tax_revenue_impact: -1_000_000,
    tax_revenue_impact: -1_000_000,
    benefit_spending_impact: 0,
    households: 0,
  },
};

/**
 * How a read refused by the firewall's limit fails on the dashboard's own
 * host, where the 429 has no CORS headers and no answer can be read.
 */
function statewideRefusal(): DashboardApiFailure {
  return new DashboardApiFailure(
    "PolicyEngine's calculation service could not be reached. Everyone on " +
      'your network, such as a workshop or an office, shares a limit on ' +
      'calculations a minute, which may have been reached. Try again in a minute.',
    null,
    true,
  );
}

/** Ends every cancelled read the way `pollEconomicImpact` does. */
async function endCancelledReads(): Promise<void> {
  await act(async () => {
    startedReads
      .filter((read) => read.signal?.aborted === true)
      .forEach((read) => read.reject(new Error('Aborted')));
  });
}

afterEach(() => {
  startedReads.splice(0);
});

describe('useEconomyImpact', () => {
  it('sends no further statewide read after one is refused for the shared limit', async () => {
    const { latest, root } = renderEconomyImpactHook();
    await act(async () => {
      void latest.hook!.run(reform);
    });
    // Four years at a time.
    const firstReads = [...startedReads];
    expect(firstReads).toHaveLength(4);

    await act(async () => {
      firstReads[0].reject(statewideRefusal());
    });
    await endCancelledReads();

    expect(startedReads).toHaveLength(4);
    expect(firstReads.slice(1).every((read) => read.signal?.aborted === true)).toBe(true);
    expect(latest.hook!.years).toEqual(
      REFORM_YEARS.map((year) => ({
        year,
        status: 'error',
        error: statewideRefusal().message,
      })),
    );
    expect(latest.hook!.running).toBe(false);

    act(() => root.unmount());
  });

  it('keeps years already read or failed when a read is refused for the shared limit', async () => {
    const { latest, root } = renderEconomyImpactHook();
    await act(async () => {
      void latest.hook!.run(reform);
    });
    const firstReads = [...startedReads];
    const serverFailure = new DashboardApiFailure(
      'PolicyEngine could not compare the economy for 2029 (HTTP 500): Internal error',
      500,
    );
    await act(async () => {
      firstReads[1].resolve(statewideResult);
      firstReads[2].reject(serverFailure);
    });
    // Other failures do not stop the run: both workers read the next years.
    expect(startedReads).toHaveLength(6);

    await act(async () => {
      firstReads[0].reject(statewideRefusal());
    });
    await endCancelledReads();

    expect(startedReads).toHaveLength(6);
    const years = latest.hook!.years;
    expect(years.find((year) => year.year === firstReads[1].year)).toMatchObject({
      status: 'ok',
      budget: statewideResult.budget,
    });
    expect(years.find((year) => year.year === firstReads[2].year)).toEqual({
      year: firstReads[2].year,
      status: 'error',
      error: serverFailure.message,
    });
    expect(
      years
        .filter((year) => year.year !== firstReads[1].year && year.year !== firstReads[2].year)
        .every((year) => year.status === 'error' && year.error === statewideRefusal().message),
    ).toBe(true);
    expect(latest.hook!.running).toBe(false);

    act(() => root.unmount());
  });

  it('runs a new "Done" normally after a read is refused for the shared limit', async () => {
    const { latest, root } = renderEconomyImpactHook();
    await act(async () => {
      void latest.hook!.run(reform);
    });
    const firstReads = [...startedReads];
    await act(async () => {
      firstReads[0].reject(statewideRefusal());
    });

    // "Done" again before the refused run's other reads have ended.
    await act(async () => {
      void latest.hook!.run(reform);
    });
    const refusedRunReads = startedReads.filter((read) => read.signal?.aborted === true);
    expect(startedReads.filter((read) => !refusedRunReads.includes(read))).toHaveLength(4);
    await endCancelledReads();
    expect(latest.hook!.running).toBe(true);
    expect(latest.hook!.years.every((year) => year.status === 'computing')).toBe(true);

    // The new run reads the remaining years and finishes.
    const answeredReads = new Set<PendingRead>(refusedRunReads);
    for (let round = 0; round < 5; round += 1) {
      const unanswered = startedReads.filter((read) => !answeredReads.has(read));
      unanswered.forEach((read) => answeredReads.add(read));
      await act(async () => {
        unanswered.forEach((read) => read.resolve(statewideResult));
      });
    }
    expect(latest.hook!.years.every((year) => year.status === 'ok')).toBe(true);
    expect(latest.hook!.running).toBe(false);

    act(() => root.unmount());
  });
});
