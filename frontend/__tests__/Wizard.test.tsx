import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Wizard, { DEFAULT_REFORM_CONFIG } from '@/components/Wizard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const household = { income: 50000, age: 35, married: false, dependents: [5] };
let mountedRoot: Root | null = null;

/** Renders the wizard and clicks "Next" until the last step's button shows. */
function renderLastStep(props: {
  calculationPauseSeconds: number;
  householdSkipped: boolean;
  onDone: () => void;
}): HTMLButtonElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  mountedRoot = createRoot(container);
  act(() =>
    mountedRoot!.render(
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
    ),
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
  act(() => mountedRoot?.unmount());
  mountedRoot = null;
  document.body.innerHTML = '';
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
