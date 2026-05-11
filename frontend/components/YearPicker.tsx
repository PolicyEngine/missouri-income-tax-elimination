'use client';

import type { YearEconomyImpact } from '@/hooks/useFullEconomyImpact';

interface Props {
  years: YearEconomyImpact[];
  selectedYear: number;
  onChange: (year: number) => void;
}

/** Prev/next year navigator that matches the household-impact tab's
 *  picker. Year status (pending / computing / error) sits under the
 *  year label so the user can see what's still resolving. */
export default function YearPicker({ years, selectedYear, onChange }: Props) {
  if (!years.length) return null;

  const minYear = years[0].year;
  const maxYear = years[years.length - 1].year;
  const completedCount = years.filter((y) => y.status === 'ok').length;
  const totalCount = years.length;

  const handlePrev = () => {
    if (selectedYear > minYear) onChange(selectedYear - 1);
  };
  const handleNext = () => {
    if (selectedYear < maxYear) onChange(selectedYear + 1);
  };

  return (
    <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
      <button
        type="button"
        onClick={handlePrev}
        disabled={selectedYear <= minYear}
        aria-label="Previous year"
        className="px-3 py-1.5 rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium"
      >
        {'\u25C0'}
      </button>
      <div className="text-center">
        <div className="text-lg font-bold text-primary">{selectedYear}</div>
        <div className="text-xs text-gray-500">
          {completedCount}/{totalCount} computed
        </div>
      </div>
      <button
        type="button"
        onClick={handleNext}
        disabled={selectedYear >= maxYear}
        aria-label="Next year"
        className="px-3 py-1.5 rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium"
      >
        {'\u25B6'}
      </button>
    </div>
  );
}
