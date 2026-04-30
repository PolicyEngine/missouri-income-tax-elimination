'use client';

import { MO_2025_RATES, REFORM_YEARS, defaultCustomRates } from '@/lib/reform';

interface Props {
  /** Year x bracket matrix; keys are years 2027-2035, values are 8-element
   * rate arrays (one entry per bracket; index 0 is fixed at 0). */
  customRates: Record<number, number[]>;
  onChange: (cr: Record<number, number[]>) => void;
}

/**
 * Bracket × year reform matrix. Users edit cells directly. The wizard's
 * "Custom" path renders this so a power user can dial in any combination.
 * For the canned cap / cut / phase-out paths, the wizard does the math
 * upstream and this component is not shown.
 */
export default function RateMatrixBuilder({ customRates, onChange }: Props) {
  // Indices 1..7 are the non-zero brackets we let users edit; index 0 is
  // always 0% (the standard-deduction band) and is hidden.
  const editableBrackets = [1, 2, 3, 4, 5, 6, 7];

  const cloneMatrix = (): Record<number, number[]> => {
    const out: Record<number, number[]> = {};
    for (const y of REFORM_YEARS) {
      const row = customRates[y];
      out[y] = row ? [...row] : [...MO_2025_RATES];
    }
    return out;
  };

  const handleCellChange = (year: number, bracket: number, percent: number) => {
    const next = cloneMatrix();
    const clamped = Math.max(0, Math.min(10, percent));
    next[year][bracket] = clamped / 100;
    onChange(next);
  };

  /** Restore every cell to MO_2025_RATES. */
  const reset = () => onChange(defaultCustomRates());

  const baselineLabels = MO_2025_RATES.map((r) => `${(r * 100).toFixed(1)}%`);

  return (
    <section className="bg-gray-50 rounded-xl p-6 border border-gray-200 shadow-sm space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Custom rate matrix
          </h2>
          <p className="text-xs text-gray-600 mt-0.5">
            Each cell is the marginal rate for that bracket in that year. Edit
            cells directly. Bracket 0 (the 0% band below the standard deduction)
            is fixed and hidden.
          </p>
        </div>
        <button type="button" onClick={reset} className={btnNeutral}>
          Reset to 2025
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-2 py-2 text-left font-medium text-gray-600 border-b border-gray-200 sticky left-0 bg-gray-100 z-10">
                Bracket (2025 rate)
              </th>
              {REFORM_YEARS.map((year) => (
                <th
                  key={year}
                  className="px-2 py-2 text-center font-medium text-gray-600 border-b border-gray-200"
                >
                  {year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {editableBrackets.map((i) => (
              <tr
                key={i}
                className="border-b border-gray-100 last:border-b-0"
              >
                <td className="px-2 py-1.5 text-gray-700 sticky left-0 bg-gray-50 z-10 whitespace-nowrap">
                  Bracket {i} <span className="text-gray-400">({baselineLabels[i]})</span>
                </td>
                {REFORM_YEARS.map((year) => {
                  const row = customRates[year] ?? MO_2025_RATES;
                  const percent = +(row[i] * 100).toFixed(2);
                  return (
                    <td key={year} className="px-1 py-1 text-center">
                      <input
                        type="number"
                        min={0}
                        max={10}
                        step={0.1}
                        value={percent}
                        onChange={(e) => {
                          const raw = Number(e.target.value);
                          handleCellChange(year, i, isNaN(raw) ? 0 : raw);
                        }}
                        aria-label={`${year} bracket ${i} rate`}
                        className="w-16 px-1.5 py-1 bg-white border border-gray-200 rounded text-xs text-gray-900 text-right focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-500">
        Rates are entered in percent (e.g. <code>4.7</code> = 4.7%). Hard cap at
        10% to guard against accidental large entries.
      </p>
    </section>
  );
}

const btnNeutral =
  'shrink-0 px-3 py-1.5 rounded-md bg-white border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-100 transition-colors';
