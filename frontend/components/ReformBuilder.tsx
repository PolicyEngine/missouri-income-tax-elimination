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
   * For eliminate_top / full_eliminate / custom this is unused (pass {}).
   */
  yearParams: Record<number, number>;
  /** Used only for eliminate_top / full_eliminate. */
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
    id: 'eliminate_top',
    label: 'Eliminate top bracket',
    description: 'Merge the top 4.7% bracket into the next one down.',
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
 * 2025 bracket thresholds used for tooltip labels on the custom table
 * column headers. Rates in parentheses come from `MO_2025_RATES`.
 */
const BRACKET_LABELS: string[] = [
  '0: $0–$1,313',
  '1: $1,313–$2,626',
  '2: $2,626–$3,939',
  '3: $3,939–$5,252',
  '4: $5,252–$6,565',
  '5: $6,565–$7,878',
  '6: $7,878–$9,191',
  '7: $9,191+',
];

/** Default year-params for each reform type. */
function defaultYearParamsFor(type: ReformType): Record<number, number> {
  if (type === 'proportional') return linearRamp(0, 0.5);
  if (type === 'top_cap') {
    // Linear ramp from current 4.7% down toward 3% by 2035.
    return linearRamp(0.047, 0.03);
  }
  // eliminate_top, full_eliminate, and custom all use {} (customRates handles
  // the matrix for the custom reform).
  return {};
}

/** Default start year for binary reforms. */
function defaultStartYearFor(_type: ReformType): number {
  return 2026;
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

                  {selected &&
                    (opt.id === 'eliminate_top' ||
                      opt.id === 'full_eliminate') && (
                      <StartYearSelect
                        value={startYear}
                        onChange={(y) => onChange(opt.id, {}, y, customRates)}
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
  const years = [2026, ...REFORM_YEARS];
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
  const [rampTo, setRampTo] = useState(50);

  /** Return a deep-copy of the current matrix, filling missing rows. */
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

  const handleReset = () => {
    onChange(defaultCustomRates());
  };

  const handleApplyRamp = () => {
    const n = REFORM_YEARS.length;
    const next: Record<number, number[]> = {};
    for (let idx = 0; idx < n; idx++) {
      const year = REFORM_YEARS[idx];
      const t = n === 1 ? 1 : idx / (n - 1);
      const cutPct = rampFrom + (rampTo - rampFrom) * t;
      const cut = cutPct / 100;
      next[year] = MO_2025_RATES.map((r) => r * (1 - cut));
    }
    onChange(next);
  };

  const handleCopyPrevious = (year: number) => {
    const idx = REFORM_YEARS.indexOf(year);
    if (idx <= 0) return;
    const prevYear = REFORM_YEARS[idx - 1];
    const next = cloneMatrix();
    next[year] = [...next[prevYear]];
    onChange(next);
  };

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={handleReset}
            className="px-2 py-1 rounded-md bg-white border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-100 transition-colors"
          >
            Reset to 2025 baseline
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
          <span className="text-gray-500">cut over 2027–2035</span>
          <button
            type="button"
            onClick={handleApplyRamp}
            className="ml-auto px-2 py-1 rounded-md bg-primary-500 text-white text-xs font-medium hover:bg-primary-600 transition-colors"
          >
            Apply ramp
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Bracket rate by year (columns are bracket indices 0–7; hover for
          thresholds)
        </label>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 bg-gray-50 px-2 py-1 text-left font-medium text-gray-600 border-b border-gray-200">
                  Year
                </th>
                {BRACKET_LABELS.map((label, i) => (
                  <th
                    key={i}
                    title={label}
                    className="px-1 py-1 text-center font-medium text-gray-600 border-b border-gray-200"
                  >
                    {i}
                  </th>
                ))}
                <th className="px-2 py-1 border-b border-gray-200" />
              </tr>
            </thead>
            <tbody>
              {REFORM_YEARS.map((year, rowIdx) => {
                const row = customRates[year] ?? MO_2025_RATES;
                return (
                  <tr key={year}>
                    <td className="sticky left-0 bg-white px-2 py-1 font-medium text-gray-700 border-b border-gray-100">
                      {year}
                    </td>
                    {BRACKET_LABELS.map((label, i) => {
                      const rate = row[i] ?? 0;
                      const percent = +(rate * 100).toFixed(2);
                      return (
                        <td
                          key={i}
                          className="px-0.5 py-1 border-b border-gray-100"
                        >
                          <input
                            type="number"
                            min={0}
                            max={10}
                            step={0.1}
                            value={percent}
                            disabled={i === 0}
                            onChange={(e) => {
                              const raw = Number(e.target.value);
                              handleCellChange(
                                year,
                                i,
                                isNaN(raw) ? 0 : raw,
                              );
                            }}
                            title={label}
                            aria-label={`${year} bracket ${i} rate (${label})`}
                            className="w-16 px-1 py-0.5 bg-white border border-gray-200 rounded text-xs text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors disabled:bg-gray-100 disabled:text-gray-400"
                          />
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 border-b border-gray-100">
                      {rowIdx > 0 && (
                        <button
                          type="button"
                          onClick={() => handleCopyPrevious(year)}
                          className="px-1.5 py-0.5 rounded bg-white border border-gray-300 text-gray-600 text-[10px] font-medium hover:bg-gray-100 transition-colors whitespace-nowrap"
                          title={`Copy ${REFORM_YEARS[rowIdx - 1]} into ${year}`}
                        >
                          Copy prev
                        </button>
                      )}
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
