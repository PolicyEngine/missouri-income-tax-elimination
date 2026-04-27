'use client';

import { useState } from 'react';
import { MO_2025_RATES, REFORM_YEARS, defaultCustomRates } from '@/lib/reform';

interface Props {
  /** Year x bracket matrix; keys are years 2027-2035, values are 8-element
   * rate arrays (one entry per bracket; index 0 is fixed at 0). */
  customRates: Record<number, number[]>;
  onChange: (cr: Record<number, number[]>) => void;
}

/**
 * Always-visible 9-year x 7-bracket reform matrix. Users edit cells
 * directly or use the action buttons above to apply a top-rate cap, a
 * percentage-point cut, or full elimination across the whole matrix.
 */
export default function RateMatrixBuilder({ customRates, onChange }: Props) {
  const [capPct, setCapPct] = useState(3.0);
  const [ppCut, setPpCut] = useState(1.0);

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

  /** Top-rate cap: any cell whose current rate exceeds the cap drops to it. */
  const applyTopCap = () => {
    const cap = Math.max(0, Math.min(10, capPct)) / 100;
    const next = cloneMatrix();
    for (const y of REFORM_YEARS) {
      for (const i of editableBrackets) {
        if (next[y][i] > cap) next[y][i] = cap;
      }
    }
    onChange(next);
  };

  /** Subtract a flat pp from every editable cell, clamped at 0. */
  const applyPpCut = () => {
    const pp = Math.max(0, Math.min(10, ppCut)) / 100;
    const next = cloneMatrix();
    for (const y of REFORM_YEARS) {
      for (const i of editableBrackets) {
        next[y][i] = Math.max(0, next[y][i] - pp);
      }
    }
    onChange(next);
  };

  /** Set every editable cell to 0. */
  const applyFullElimination = () => {
    const next = cloneMatrix();
    for (const y of REFORM_YEARS) {
      for (const i of editableBrackets) next[y][i] = 0;
    }
    onChange(next);
  };

  /** Restore every cell to MO_2025_RATES. */
  const reset = () => onChange(defaultCustomRates());

  const baselineLabels = MO_2025_RATES.map((r) => `${(r * 100).toFixed(1)}%`);

  return (
    <section className="bg-gray-50 rounded-xl p-6 md:p-8 border border-gray-200 shadow-sm space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Reform: Missouri bracket rates 2027–2035</h2>
        <p className="text-sm text-gray-600 mt-1">
          Each cell is the marginal tax rate for that bracket in that year. Edit
          cells directly, or use one of the buttons below to apply a uniform
          change to every cell. Bracket 0 (the 0% band below the standard
          deduction) is fixed and hidden.
        </p>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ActionRow
          title="Top-rate cap"
          description="Reduce every cell whose rate exceeds the cap to the cap."
        >
          <span className="text-xs text-gray-500">Cap at</span>
          <PctInput value={capPct} onChange={setCapPct} max={4.7} />
          <button type="button" onClick={applyTopCap} className={btnPrimary}>
            Apply
          </button>
        </ActionRow>
        <ActionRow
          title="Percentage-point cut"
          description="Subtract a flat pp from every cell; rates floor at 0%."
        >
          <span className="text-xs text-gray-500">Subtract</span>
          <PctInput value={ppCut} onChange={setPpCut} max={4.7} suffix="pp" />
          <button type="button" onClick={applyPpCut} className={btnPrimary}>
            Apply
          </button>
        </ActionRow>
        <ActionRow
          title="Full elimination"
          description="Set every bracket rate to 0% for every year 2027–2035."
        >
          <button
            type="button"
            onClick={applyFullElimination}
            className={btnPrimary}
          >
            Zero out every cell
          </button>
        </ActionRow>
        <ActionRow
          title="Reset"
          description="Restore the entire matrix to Missouri's 2025 baseline rates."
        >
          <button type="button" onClick={reset} className={btnNeutral}>
            Reset to 2025 baseline
          </button>
        </ActionRow>
      </div>

      {/* Rate matrix */}
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

const btnPrimary =
  'px-3 py-1.5 rounded-md bg-primary-500 text-white text-xs font-medium hover:bg-primary-600 transition-colors';
const btnNeutral =
  'px-3 py-1.5 rounded-md bg-white border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-100 transition-colors';

function ActionRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <div className="text-xs text-gray-500 mt-0.5">{description}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">{children}</div>
      </div>
    </div>
  );
}

function PctInput({
  value,
  onChange,
  max,
  suffix = '%',
}: {
  value: number;
  onChange: (v: number) => void;
  max: number;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        min={0}
        max={max}
        step={0.1}
        value={value}
        onChange={(e) => {
          const raw = Number(e.target.value);
          if (isNaN(raw)) return;
          onChange(Math.max(0, Math.min(max, raw)));
        }}
        className="w-20 pl-2 pr-7 py-1 bg-white border border-gray-200 rounded text-xs text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
      />
      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] pointer-events-none">
        {suffix}
      </span>
    </div>
  );
}
