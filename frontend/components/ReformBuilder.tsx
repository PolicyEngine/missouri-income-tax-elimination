'use client';

import { useState } from 'react';
import {
  MO_2025_RATES,
  REFORM_YEARS,
  constantRamp,
  defaultCustomRates,
  linearRamp,
  type ReformType,
} from '@/lib/reform';

interface Props {
  type: ReformType;
  /**
   * Per-year params. For proportional/top_cap, keys are years 2027-2035.
   * For full_eliminate / custom this is unused (pass {}).
   */
  yearParams: Record<number, number>;
  /** Used only for full_eliminate. */
  startYear: number;
  /** 9 × 8 matrix (year × bracket) of rates for the custom reform. */
  customRates: Record<number, number[]>;
  onChange: (
    type: ReformType,
    yearParams: Record<number, number>,
    startYear: number,
    customRates: Record<number, number[]>,
  ) => void;
}

const REFORM_OPTIONS: {
  id: ReformType;
  label: string;
  description: string;
}[] = [
  {
    id: 'proportional',
    label: 'Proportional rate cut',
    description: 'Reduce every Missouri bracket rate by the same percentage. Pick a cut per year from 2027 through 2035.',
  },
  {
    id: 'top_cap',
    label: 'Top-rate cap',
    description: 'Cap the top marginal rate at a value you choose for each year. Every bracket whose current rate exceeds that year\'s cap is reduced to it.',
  },
  {
    id: 'full_eliminate',
    label: 'Full elimination',
    description: 'Set every Missouri bracket rate to zero.',
  },
  {
    id: 'custom',
    label: 'Custom schedule',
    description:
      'Set every bracket rate for every year 2027–2035 individually.',
  },
];

/**
 * 2025 bracket threshold ranges for the custom schedule UI, indexed by
 * bracket (0–7). Used as labels in the per-year bracket table.
 */
const BRACKET_THRESHOLDS: string[] = [
  '$0 – $1,313',
  '$1,313 – $2,626',
  '$2,626 – $3,939',
  '$3,939 – $5,252',
  '$5,252 – $6,565',
  '$6,565 – $7,878',
  '$7,878 – $9,191',
  '$9,191+',
];

/** Default year-params for each reform type. */
function defaultYearParamsFor(type: ReformType): Record<number, number> {
  if (type === 'proportional') return linearRamp(0, 0.5);
  if (type === 'top_cap') {
    // Linear ramp from current 4.7% down toward 3% by 2035.
    return linearRamp(0.047, 0.03);
  }
  // full_eliminate and custom both use {} (customRates handles the matrix
  // for the custom reform).
  return {};
}

/** Default start year for binary reforms. */
function defaultStartYearFor(_type: ReformType): number {
  return 2027;
}

export default function ReformBuilder({
  type,
  yearParams,
  startYear,
  customRates,
  onChange,
}: Props) {
  return (
    <section className="bg-gray-50 rounded-xl p-6 md:p-8 border border-gray-200 shadow-sm">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Reform scenario</h2>

      <div className="space-y-3">
        {REFORM_OPTIONS.map((opt) => {
          const selected = type === opt.id;
          return (
            <label
              key={opt.id}
              className={`block cursor-pointer rounded-lg border p-4 transition-colors ${
                selected
                  ? 'border-primary-500 bg-white shadow-sm'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="reform-type"
                  value={opt.id}
                  checked={selected}
                  onChange={() =>
                    onChange(
                      opt.id,
                      defaultYearParamsFor(opt.id),
                      defaultStartYearFor(opt.id),
                      // Seed the custom matrix on first entry; preserve the
                      // user's edits when they switch back to any other type.
                      opt.id === 'custom' ? defaultCustomRates() : customRates,
                    )
                  }
                  className="mt-1 h-4 w-4 border-gray-300 text-primary-500 focus:ring-primary-500"
                />
                <div className="flex-1">
                  <span className="block text-sm font-semibold text-gray-900">
                    {opt.label}
                  </span>
                  <span className="block text-xs text-gray-600 mt-0.5">
                    {opt.description}
                  </span>

                  {selected && opt.id === 'proportional' && (
                    <ProportionalYearTable
                      yearParams={yearParams}
                      onChange={(yp) =>
                        onChange('proportional', yp, 2026, customRates)
                      }
                    />
                  )}

                  {selected && opt.id === 'top_cap' && (
                    <TopCapYearTable
                      yearParams={yearParams}
                      onChange={(yp) =>
                        onChange('top_cap', yp, 2026, customRates)
                      }
                    />
                  )}

                  {selected && opt.id === 'full_eliminate' && (
                    <StartYearSelect
                      value={startYear}
                      onChange={(y) =>
                        onChange('full_eliminate', {}, y, customRates)
                      }
                    />
                  )}

                  {selected && opt.id === 'custom' && (
                    <CustomRatesTable
                      customRates={customRates}
                      onChange={(cr) => onChange('custom', {}, 2027, cr)}
                    />
                  )}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- */
/*                        Per-year proportional table                     */
/* --------------------------------------------------------------------- */

function ProportionalYearTable({
  yearParams,
  onChange,
}: {
  yearParams: Record<number, number>;
  onChange: (yp: Record<number, number>) => void;
}) {
  const [rampStart, setRampStart] = useState(0);
  const [rampEnd, setRampEnd] = useState(50);
  const [applyAll, setApplyAll] = useState(50);

  const handleYearChange = (year: number, percent: number) => {
    onChange({ ...yearParams, [year]: percent / 100 });
  };

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-gray-700">Linear ramp:</span>
          <NumberBox
            value={rampStart}
            onChange={setRampStart}
            min={0}
            max={100}
            step={5}
            suffix="%"
          />
          <span className="text-gray-500">to</span>
          <NumberBox
            value={rampEnd}
            onChange={setRampEnd}
            min={0}
            max={100}
            step={5}
            suffix="%"
          />
          <span className="text-gray-500">over 2027–2035</span>
          <button
            type="button"
            onClick={() =>
              onChange(linearRamp(rampStart / 100, rampEnd / 100))
            }
            className="ml-auto px-2 py-1 rounded-md bg-primary-500 text-white text-xs font-medium hover:bg-primary-600 transition-colors"
          >
            Apply ramp
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-gray-700">Apply to all:</span>
          <NumberBox
            value={applyAll}
            onChange={setApplyAll}
            min={0}
            max={100}
            step={5}
            suffix="%"
          />
          <button
            type="button"
            onClick={() => onChange(constantRamp(applyAll / 100))}
            className="px-2 py-1 rounded-md bg-white border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-100 transition-colors"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => onChange(constantRamp(0))}
            className="ml-auto px-2 py-1 rounded-md bg-white border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-100 transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Rate reduction by year
        </label>
        <div className="grid grid-cols-3 gap-2">
          {REFORM_YEARS.map((year) => {
            const percent = Math.round((yearParams[year] ?? 0) * 100);
            return (
              <div
                key={year}
                className="bg-white border border-gray-200 rounded-md px-2 py-1.5"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium text-gray-600">
                    {year}
                  </span>
                  <span className="text-[11px] font-semibold text-gray-900">
                    {percent}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={percent}
                  onChange={(e) =>
                    handleYearChange(year, Number(e.target.value))
                  }
                  className="w-full accent-primary-500"
                  aria-label={`Rate reduction for ${year}`}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/*                        Per-year top-cap table                          */
/* --------------------------------------------------------------------- */

function TopCapYearTable({
  yearParams,
  onChange,
}: {
  yearParams: Record<number, number>;
  onChange: (yp: Record<number, number>) => void;
}) {
  const [rampStart, setRampStart] = useState(4.7);
  const [rampEnd, setRampEnd] = useState(3.0);
  const [applyAll, setApplyAll] = useState(3.0);

  const handleYearChange = (year: number, percent: number) => {
    const clamped = Math.max(0, Math.min(4.7, percent));
    onChange({ ...yearParams, [year]: clamped / 100 });
  };

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-gray-700">Linear ramp:</span>
          <NumberBox
            value={rampStart}
            onChange={setRampStart}
            min={0}
            max={4.7}
            step={0.1}
            suffix="%"
          />
          <span className="text-gray-500">to</span>
          <NumberBox
            value={rampEnd}
            onChange={setRampEnd}
            min={0}
            max={4.7}
            step={0.1}
            suffix="%"
          />
          <span className="text-gray-500">over 2027–2035</span>
          <button
            type="button"
            onClick={() =>
              onChange(linearRamp(rampStart / 100, rampEnd / 100))
            }
            className="ml-auto px-2 py-1 rounded-md bg-primary-500 text-white text-xs font-medium hover:bg-primary-600 transition-colors"
          >
            Apply ramp
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-gray-700">Apply to all:</span>
          <NumberBox
            value={applyAll}
            onChange={setApplyAll}
            min={0}
            max={4.7}
            step={0.1}
            suffix="%"
          />
          <button
            type="button"
            onClick={() => onChange(constantRamp(applyAll / 100))}
            className="px-2 py-1 rounded-md bg-white border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-100 transition-colors"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => onChange(constantRamp(0.047))}
            className="ml-auto px-2 py-1 rounded-md bg-white border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-100 transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Top-bracket cap by year (current top rate: 4.7%)
        </label>
        <div className="grid grid-cols-3 gap-2">
          {REFORM_YEARS.map((year) => {
            const raw = yearParams[year];
            const percent =
              raw === undefined || raw === null || isNaN(raw)
                ? 4.7
                : +(raw * 100).toFixed(2);
            return (
              <div
                key={year}
                className="bg-white border border-gray-200 rounded-md px-2 py-1.5"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium text-gray-600">
                    {year}
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={4.7}
                    step={0.1}
                    value={percent}
                    onChange={(e) => {
                      const raw = Number(e.target.value);
                      handleYearChange(year, isNaN(raw) ? 4.7 : raw);
                    }}
                    className="w-full pl-2 pr-6 py-1 bg-white border border-gray-200 rounded text-xs text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                    aria-label={`Top-bracket cap for ${year}`}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">
                    %
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/*                        Start-year selector                             */
/* --------------------------------------------------------------------- */

function StartYearSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (year: number) => void;
}) {
  const years = REFORM_YEARS;
  return (
    <div className="mt-3">
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        Apply starting in:
      </label>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
        aria-label="Reform start year"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/*                       Custom year × bracket table                      */
/* --------------------------------------------------------------------- */

function CustomRatesTable({
  customRates,
  onChange,
}: {
  customRates: Record<number, number[]>;
  onChange: (cr: Record<number, number[]>) => void;
}) {
  const [rampFrom, setRampFrom] = useState(0);
  const [rampTo, setRampTo] = useState(100);
  // Currently-selected year index into REFORM_YEARS. Starts at the first
  // year (2027) so the prev-arrow is disabled initially.
  const [yearIdx, setYearIdx] = useState(0);
  const year = REFORM_YEARS[yearIdx];
  const prevYear = yearIdx > 0 ? REFORM_YEARS[yearIdx - 1] : null;
  const canGoPrev = yearIdx > 0;
  const canGoNext = yearIdx < REFORM_YEARS.length - 1;

  /** Return a deep-copy of the current matrix, filling missing rows. */
  const cloneMatrix = (): Record<number, number[]> => {
    const out: Record<number, number[]> = {};
    for (const y of REFORM_YEARS) {
      const row = customRates[y];
      out[y] = row ? [...row] : [...MO_2025_RATES];
    }
    return out;
  };

  const handleCellChange = (bracket: number, percent: number) => {
    const next = cloneMatrix();
    const clamped = Math.max(0, Math.min(10, percent));
    next[year][bracket] = clamped / 100;
    onChange(next);
  };

  const handleResetYear = () => {
    const next = cloneMatrix();
    next[year] = [...MO_2025_RATES];
    onChange(next);
  };

  const handleCopyPrev = () => {
    if (prevYear === null) return;
    const next = cloneMatrix();
    next[year] = [...next[prevYear]];
    onChange(next);
  };

  const handleResetAll = () => {
    onChange(defaultCustomRates());
  };

  const handleApplyRamp = () => {
    const n = REFORM_YEARS.length;
    const next: Record<number, number[]> = {};
    for (let idx = 0; idx < n; idx++) {
      const y = REFORM_YEARS[idx];
      const t = n === 1 ? 1 : idx / (n - 1);
      const cutPct = rampFrom + (rampTo - rampFrom) * t;
      const cut = cutPct / 100;
      next[y] = MO_2025_RATES.map((r) => r * (1 - cut));
    }
    onChange(next);
  };

  const currentRow = customRates[year] ?? MO_2025_RATES;

  return (
    <div className="mt-3 space-y-3">
      {/* Year navigation */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-gray-700">Year:</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => canGoPrev && setYearIdx(yearIdx - 1)}
              disabled={!canGoPrev}
              aria-label="Previous year"
              className="px-2 py-1 rounded-md bg-white border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {'\u25C0'}
            </button>
            <span className="text-sm font-semibold text-gray-900 min-w-[3.5rem] text-center">
              {year}
            </span>
            <button
              type="button"
              onClick={() => canGoNext && setYearIdx(yearIdx + 1)}
              disabled={!canGoNext}
              aria-label="Next year"
              className="px-2 py-1 rounded-md bg-white border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {'\u25B6'}
            </button>
          </div>
          <span className="text-[10px] text-gray-500 whitespace-nowrap">
            {REFORM_YEARS[0]}–{REFORM_YEARS[REFORM_YEARS.length - 1]}
          </span>
        </div>
      </div>

      {/* Per-year bracket table */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Rate by bracket for {year}
        </label>
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-2 py-1.5 text-left font-medium text-gray-600 border-b border-gray-200 w-12">
                  Bkt
                </th>
                <th className="px-2 py-1.5 text-left font-medium text-gray-600 border-b border-gray-200">
                  Threshold
                </th>
                <th className="px-2 py-1.5 text-right font-medium text-gray-600 border-b border-gray-200 w-24">
                  Rate (%)
                </th>
              </tr>
            </thead>
            <tbody>
              {BRACKET_THRESHOLDS.map((threshold, i) => {
                const rate = currentRow[i] ?? 0;
                const percent = +(rate * 100).toFixed(2);
                return (
                  <tr key={i} className="border-b border-gray-100 last:border-b-0">
                    <td className="px-2 py-1.5 font-medium text-gray-700">
                      {i}
                    </td>
                    <td className="px-2 py-1.5 text-gray-600">{threshold}</td>
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number"
                        min={0}
                        max={10}
                        step={0.1}
                        value={percent}
                        disabled={i === 0}
                        onChange={(e) => {
                          const raw = Number(e.target.value);
                          handleCellChange(i, isNaN(raw) ? 0 : raw);
                        }}
                        aria-label={`${year} bracket ${i} rate`}
                        className="w-20 px-2 py-0.5 bg-white border border-gray-200 rounded text-xs text-gray-900 text-right focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors disabled:bg-gray-100 disabled:text-gray-400"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[10px] text-gray-500">
          Rates are entered in percent. Bracket 0 is fixed at 0%. Max 10% as a
          safety cap.
        </p>
      </div>

      {/* Per-year actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleResetYear}
          className="px-2 py-1 rounded-md bg-white border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-100 transition-colors"
        >
          Reset {year} to baseline
        </button>
        <button
          type="button"
          onClick={handleCopyPrev}
          disabled={prevYear === null}
          className="px-2 py-1 rounded-md bg-white border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {prevYear !== null
            ? `Copy ${prevYear} \u2192 ${year}`
            : `Copy previous year`}
        </button>
      </div>

      {/* Apply-to-all-years section */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
        <div className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">
          Apply to all years ({REFORM_YEARS[0]}–
          {REFORM_YEARS[REFORM_YEARS.length - 1]})
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={handleResetAll}
            className="px-2 py-1 rounded-md bg-white border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-100 transition-colors"
          >
            Reset all to baseline
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-gray-700">Proportional ramp:</span>
          <NumberBox
            value={rampFrom}
            onChange={setRampFrom}
            min={0}
            max={100}
            step={5}
            suffix="%"
          />
          <span className="text-gray-500">to</span>
          <NumberBox
            value={rampTo}
            onChange={setRampTo}
            min={0}
            max={100}
            step={5}
            suffix="%"
          />
          <span className="text-gray-500">cut over 9 years</span>
          <button
            type="button"
            onClick={handleApplyRamp}
            className="ml-auto px-2 py-1 rounded-md bg-primary-500 text-white text-xs font-medium hover:bg-primary-600 transition-colors"
          >
            Apply ramp
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/*                          Small number box                              */
/* --------------------------------------------------------------------- */

function NumberBox({
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const raw = Number(e.target.value);
          if (isNaN(raw)) return;
          onChange(Math.max(min, Math.min(max, raw)));
        }}
        className="w-16 pl-2 pr-5 py-1 bg-white border border-gray-200 rounded text-xs text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
      />
      {suffix && (
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">
          {suffix}
        </span>
      )}
    </div>
  );
}
