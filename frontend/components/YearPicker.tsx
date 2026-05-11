'use client';

import type { YearEconomyImpact } from '@/hooks/useFullEconomyImpact';

interface Props {
  years: YearEconomyImpact[];
  selectedYear: number;
  onChange: (year: number) => void;
}

/** Row of pill buttons matching NC's "Tax year" picker — one button per
 *  year in the budget window. Years still computing or in error are
 *  still selectable; the parent surfaces the right loading / error
 *  state from the row data. */
export default function YearPicker({ years, selectedYear, onChange }: Props) {
  if (!years.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
      <span>Tax year:</span>
      {years.map((y) => (
        <button
          key={y.year}
          type="button"
          onClick={() => onChange(y.year)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            selectedYear === y.year
              ? 'bg-primary-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {y.year}
        </button>
      ))}
    </div>
  );
}
