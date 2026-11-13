import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ImpactAnalysis from '@/components/ImpactAnalysis';
import Wizard, { DEFAULT_REFORM_CONFIG } from '@/components/Wizard';
import type { YearHouseholdImpact } from '@/hooks/useMultiYearHouseholdImpact';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const household = { income: 50000, age: 35, married: false, dependents: [5] };
const mountedRoots: Root[] = [];

/** Renders `element` into a new container in the document. */
function renderIntoDocument(element: ReactElement): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => root.render(element));
  return container;
}

/** Renders the wizard and clicks "Next" until the last step's button shows. */
function renderLastStep(props: {
  calculationPauseSeconds: number;
  householdSkipped: boolean;
  onDone: () => void;
}): HTMLButtonElement {
  const container = renderIntoDocument(
    <Wizard
      path="cap"
      onPathChange={() => undefined}
      config={DEFAULT_REFORM_CONFIG}
      onConfigChange={() => undefined}
      household={household}
      onHouseholdChange={() => undefined}
      onShowResults={() => undefined}
      onDone={props.onDone}
      onSkipHousehold={() => undefined}
      householdSkipped={props.householdSkipped}
      calculationPauseSeconds={props.calculationPauseSeconds}
    />,
  );
  const lastStepButton = () =>
    Array.from(container.querySelectorAll('button')).find((button) =>
      /^(Done|Calculate again in \d+ s)$/.test(button.textContent ?? ''),
    );
  for (let step = 0; step < 10 && lastStepButton() === undefined; step += 1) {
    const nextButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Next',
    );
    act(() => nextButton!.click());
  }
  return lastStepButton() as HTMLButtonElement;
}

afterEach(() => {
  act(() => mountedRoots.splice(0).forEach((root) => root.unmount()));
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('Wizard', () => {
  it('holds "Done" during the pause after a rate-limit refusal, with a countdown', () => {
    const onDone = vi.fn();

    const doneButton = renderLastStep({
      calculationPauseSeconds: 42,
      householdSkipped: false,
      onDone,
    });

    expect(doneButton.textContent).toBe('Calculate again in 42 s');
    expect(doneButton.disabled).toBe(true);
    act(() => doneButton.click());
    expect(onDone).not.toHaveBeenCalled();
  });

  it('explains the pause beside "Done"', () => {
    const doneButton = renderLastStep({
      calculationPauseSeconds: 42,
      householdSkipped: false,
      onDone: vi.fn(),
    });

    expect(doneButton.closest('div')?.parentElement?.textContent).toContain(
      'Everyone on your network, such as a workshop or an office, shares a ' +
        'limit on calculations a minute. This page can calculate again in 42 s.',
    );
  });

  it('announces the pause once, not every second of the countdown', () => {
    renderLastStep({
      calculationPauseSeconds: 42,
      householdSkipped: false,
      onDone: vi.fn(),
    });

    const liveRegions = Array.from(
      document.querySelectorAll('[role="status"], [aria-live]'),
    );
    expect(liveRegions.map((region) => region.textContent)).toEqual([
      'Everyone on your network, such as a workshop or an office, shares a ' +
        'limit on calculations a minute.',
    ]);
  });

  it('announces the shared limit once while the last results stay on screen', () => {
    // After a refusal, the last finished run stays on screen with a notice
    // above it, and "Done" waits out the minute with its explanation.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const lastRunYears: YearHouseholdImpact[] = [2027, 2028].map((year) => ({
      year,
      status: 'ok',
      data: {
        income_range: [0, 400000],
        net_income_change: [0, 100],
        federalTaxChange: [0, 0],
        stateTaxChange: [0, -100],
        netIncomeChange: [0, 100],
        benefit_at_income: {
          baseline: 50000,
          reform: 50050,
          difference: 50,
          federal_tax_change: 0,
          state_tax_change: -50,
          net_income_change: 50,
        },
        x_axis_max: 400000,
      },
    }));
    const refusalMessage =
      'Everyone on your network, such as a workshop or an office, shares a ' +
      'limit on calculations a minute, and it has been reached.';
    renderLastStep({
      calculationPauseSeconds: 42,
      householdSkipped: false,
      onDone: vi.fn(),
    });
    renderIntoDocument(
      <ImpactAnalysis
        years={lastRunYears}
        baseRequest={{
          age_head: 35,
          age_spouse: null,
          dependent_ages: [5],
          income: 50000,
          max_earnings: 400000,
          state_code: 'MO',
        }}
        selectedYear={2027}
        rateLimitNotice={refusalMessage}
      />,
    );

    expect(document.body.textContent).toContain(refusalMessage);
    const liveRegionsWithExplanation = Array.from(
      document.querySelectorAll('[role="status"], [aria-live]'),
    ).filter((region) =>
      region.textContent?.includes(
        'Everyone on your network, such as a workshop or an office, shares a ' +
          'limit on calculations a minute',
      ),
    );
    expect(liveRegionsWithExplanation).toHaveLength(1);
  });

  it('lets "Done" run the statewide comparisons when the household is skipped', () => {
    const onDone = vi.fn();

    const doneButton = renderLastStep({
      calculationPauseSeconds: 42,
      householdSkipped: true,
      onDone,
    });

    expect(doneButton.textContent).toBe('Done');
    act(() => doneButton.click());
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
