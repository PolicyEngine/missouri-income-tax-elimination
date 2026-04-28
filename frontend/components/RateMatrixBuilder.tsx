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
  // Top-rate cap inputs. The cap is interpolated linearly from
  // (capStartYear, capStart) to (capEndYear, capEnd). To apply a single
  // uniform cap across all years, set capStart == capEnd.
  // Defaults pin the cap at Missouri's current top rate (4.7%) in 2027,
  // making "Apply" a no-op until the user lowers the start value or
  // edits the end-year cap.
  const [capStart, setCapStart] = useState(4.7);
  const [capEnd, setCapEnd] = useState(3.0);
  const [capStartYear, setCapStartYear] = useState(2027);
  const [capEndYear, setCapEndYear] = useState(2035);
  // Percentage-point cut inputs (same shape as the cap).
  // Defaults: 0 pp in 2027 ramping to 1.5 pp in 2035.
  const [ppStart, setPpStart] = useState(0);
  const [ppEnd, setPpEnd] = useState(1.5);
  const [ppStartYear, setPpStartYear] = useState(2027);
  const [ppEndYear, setPpEndYear] = useState(2035);
  // Full-elimination start year. Years strictly before this are left
  // untouched; this year and every later year are zeroed.
  const [eliminateStartYear, setEliminateStartYear] = useState(2027);

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

  /** Zero every editable cell from eliminateStartYear onward. Years
   * strictly before the start year are left untouched. */
  const applyFullElimination = () => {
    const next = cloneMatrix();
    for (const y of REFORM_YEARS) {
      if (y < eliminateStartYear) continue;
      for (const i of editableBrackets) next[y][i] = 0;
    }
    onChange(next);
  };

  /**
   * For a year y, return the linearly-interpolated value given
   * (startYear, startValue) and (endYear, endValue). Years before the
   * earliest endpoint return that endpoint's value; years after the
   * latest endpoint return that endpoint's value.
   */
  const interpolateRamp = (
    y: number,
    startYear: number,
    endYear: number,
    startValue: number,
    endValue: number,
  ): number => {
    if (startYear === endYear) return startValue;
    const a = Math.min(startYear, endYear);
    const b = Math.max(startYear, endYear);
    if (y <= a) return startYear <= endYear ? startValue : endValue;
    if (y >= b) return startYear <= endYear ? endValue : startValue;
    const t = (y - startYear) / (endYear - startYear);
    return startValue + (endValue - startValue) * t;
  };

  /** Top-rate cap. The cap is linearly interpolated between the start
   * year/value and the end year/value; for each year, every cell whose
   * current rate exceeds that year's cap drops to it. Years strictly
   * before capStartYear are left untouched. */
  const applyTopCap = () => {
    const next = cloneMatrix();
    for (const y of REFORM_YEARS) {
      if (y < capStartYear) continue;
      const capPctY = interpolateRamp(
        y,
        capStartYear,
        capEndYear,
        capStart,
        capEnd,
      );
      const cap = Math.max(0, Math.min(10, capPctY)) / 100;
      for (const i of editableBrackets) {
        if (next[y][i] > cap) next[y][i] = cap;
      }
    }
    onChange(next);
  };

  /** Percentage-point cut. The pp amount is linearly interpolated between
   * the start year/value and the end year/value; for each year, every
   * cell decreases by that year's interpolated pp amount, floored at 0.
   * Years strictly before ppStartYear are left untouched. */
  const applyPpCut = () => {
    const next = cloneMatrix();
    for (const y of REFORM_YEARS) {
      if (y < ppStartYear) continue;
      const ppY = interpolateRamp(
        y,
        ppStartYear,
        ppEndYear,
        ppStart,
        ppEnd,
      );
      const pp = Math.max(0, Math.min(10, ppY)) / 100;
      for (const i of editableBrackets) {
        next[y][i] = Math.max(0, next[y][i] - pp);
      }
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
          description="Cap rates between two years. Set start cap = end cap for a uniform cap; otherwise the cap is linearly interpolated. Years before the start year are left untouched."
        >
          <YearSelect value={capStartYear} onChange={setCapStartYear} />
          <PctInput value={capStart} onChange={setCapStart} max={4.7} />
          <span className="text-xs text-gray-500">→</span>
          <YearSelect value={capEndYear} onChange={setCapEndYear} />
          <PctInput value={capEnd} onChange={setCapEnd} max={4.7} />
          <button type="button" onClick={applyTopCap} className={btnPrimary}>
            Apply
          </button>
        </ActionRow>
        <ActionRow
          title="Percentage-point cut"
          description="Subtract pp between two years. Set start pp = end pp for a uniform cut; otherwise the cut is linearly interpolated. Years before the start year are left untouched."
        >
          <YearSelect value={ppStartYear} onChange={setPpStartYear} />
          <PctInput value={ppStart} onChange={setPpStart} max={4.7} suffix="pp" />
          <span className="text-xs text-gray-500">→</span>
          <YearSelect value={ppEndYear} onChange={setPpEndYear} />
          <PctInput value={ppEnd} onChange={setPpEnd} max={4.7} suffix="pp" />
          <button type="button" onClick={applyPpCut} className={btnPrimary}>
            Apply
          </button>
        </ActionRow>
        <ActionRow
          title="Full elimination"
          description="Zero every bracket rate from the chosen year onward; earlier years are left untouched."
        >
          <span className="text-xs text-gray-500">Starting in</span>
          <YearSelect
            value={eliminateStartYear}
            onChange={setEliminateStartYear}
          />
          <button
            type="button"
            onClick={applyFullElimination}
            className={btnPrimary}
          >
            Apply
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
    <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
      <div>
        <div className="text-sm font-semibold text-gray-900">{title}</div>
        <div className="text-xs text-gray-500 mt-0.5">{description}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function YearSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="px-1.5 py-1 bg-white border border-gray-200 rounded text-xs text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
      aria-label="Ramp year"
    >
      {REFORM_YEARS.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
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
