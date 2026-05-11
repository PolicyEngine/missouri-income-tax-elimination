'use client';

import type { YearEconomyImpact } from '@/hooks/useFullEconomyImpact';

interface Props {
  years: YearEconomyImpact[];
  selectedYear: number;
  onChange: (year: number) => void;
}

/** Compact year picker shared by the Distributional / Winners-Losers /
 *  Poverty tabs. Years still computing or in error are still selectable
 *  so the parent can show its own loading / error state. */
export default function YearPicker({ years, selectedYear, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="impact-year"
        className="text-sm font-medium text-gray-700"
      >
        Tax year
      </label>
      <select
        id="impact-year"
        value={selectedYear}
        onChange={(e) => onChange(Number(e.target.value))}
        className="bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
      >
        {years.map((y) => (
          <option key={y.year} value={y.year}>
            {y.year}
            {y.status === 'computing'
              ? ' (computing…)'
              : y.status === 'pending'
                ? ' (pending)'
                : y.status === 'error'
                  ? ' (error)'
                  : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
