import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import ImpactAnalysis from '@/components/ImpactAnalysis';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ImpactAnalysis', () => {
  it('says a first calculation can take a few minutes while a year calculates', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() =>
      root.render(
        <ImpactAnalysis
          years={[{ year: 2027, status: 'computing' }]}
          baseRequest={{
            age_head: 35,
            age_spouse: null,
            dependent_ages: [5],
            income: 50000,
            max_earnings: 400000,
            state_code: 'MO',
          }}
          selectedYear={2027}
        />,
      ),
    );

    expect(container.textContent).toContain('Calculating impact for 2027...');
    expect(container.textContent).toContain('A first calculation can take a few minutes.');

    act(() => root.unmount());
  });
});
