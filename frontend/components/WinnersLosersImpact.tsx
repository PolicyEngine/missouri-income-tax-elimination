'use client';

import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { YearEconomyImpact } from '@/hooks/useFullEconomyImpact';
import ChartWatermark from './ChartWatermark';
import YearPicker from './YearPicker';

const COLORS = {
  gainMore5: 'var(--chart-gain-more-5)',
  gainLess5: 'var(--chart-gain-less-5)',
  noChange: 'var(--chart-no-change)',
  loseLess5: 'var(--chart-lose-less-5)',
  loseMore5: 'var(--chart-lose-more-5)',
  positive: 'var(--chart-positive)',
  negative: 'var(--chart-negative)',
};

const CHART_MARGIN = { top: 20, right: 20, bottom: 30, left: 40 };
const TICK_STYLE = { fontFamily: 'var(--font-sans)', fontSize: 12 };

interface Props {
  years: YearEconomyImpact[];
  running: boolean;
}

function CustomTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color?: string }[];
  label?: string;
  formatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'var(--chart-tooltip-bg)',
        border: '1px solid var(--chart-tooltip-border)',
        borderRadius: 4,
        padding: '8px 12px',
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
      }}
    >
      {label && (
        <p
          style={{
            margin: '0 0 4px',
            fontWeight: 600,
            color: 'var(--text-heading)',
          }}
        >
          {label === 'All' ? 'All households' : `Decile ${label}`}
        </p>
      )}
      {payload.map((entry, i) => (
        <p key={i} style={{ margin: 0, color: entry.color ?? 'var(--text-body)' }}>
          {entry.name}: {formatter ? formatter(entry.value) : entry.value}
        </p>
      ))}
    </div>
  );
}

export default function WinnersLosersImpact({ years, running }: Props) {
  const [selectedYear, setSelectedYear] = useState(2027);

  if (!years.length) return null;

  const yearData = years.find((y) => y.year === selectedYear);
  const completed = years.filter((y) => y.status === 'ok').length;
  const total = years.length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-primary">Winners &amp; losers</h2>
        <p className="text-sm text-gray-600 mt-1">
          Share of Missouri households whose net income rises or falls under
          the reform, broken out by income decile.
        </p>
      </div>

      {running && (
        <div className="rounded-lg border border-primary-200 bg-primary-50 p-4 text-sm text-primary-800">
          Computing economy-wide impacts &mdash; <strong>{completed}</strong>{' '}
          of <strong>{total}</strong> years complete&hellip;
        </div>
      )}

      <YearPicker
        years={years}
        selectedYear={selectedYear}
        onChange={setSelectedYear}
      />

      {yearData?.status === 'computing' || yearData?.status === 'pending' ? (
        <div className="bg-white border rounded-lg p-12 text-center text-gray-500">
          Computing {selectedYear}&hellip;
        </div>
      ) : yearData?.status === 'error' ? (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          {yearData.error || 'Failed to load winners/losers for this year.'}
        </div>
      ) : yearData?.intra_decile ? (
        (() => {
          const intra = yearData.intra_decile;
          const categories = [
            {
              key: 'gain_more_than_5pct',
              label: 'Gain more than 5%',
              color: COLORS.gainMore5,
            },
            {
              key: 'gain_less_than_5pct',
              label: 'Gain less than 5%',
              color: COLORS.gainLess5,
            },
            { key: 'no_change', label: 'No change', color: COLORS.noChange },
            {
              key: 'lose_less_than_5pct',
              label: 'Lose less than 5%',
              color: COLORS.loseLess5,
            },
            {
              key: 'lose_more_than_5pct',
              label: 'Lose more than 5%',
              color: COLORS.loseMore5,
            },
          ] as const;

          const stackedData = [
            {
              label: 'All',
              ...Object.fromEntries(
                categories.map((c) => [c.key, intra.all[c.key] * 100]),
              ),
            },
            ...Array.from({ length: 10 }, (_, i) => {
              const d = 10 - i;
              return {
                label: `${d}`,
                ...Object.fromEntries(
                  categories.map((c) => [c.key, intra.deciles[c.key][d - 1] * 100]),
                ),
              };
            }),
          ];

          const winnersRate =
            (intra.all.gain_more_than_5pct + intra.all.gain_less_than_5pct) * 100;
          const losersRate =
            (intra.all.lose_more_than_5pct + intra.all.lose_less_than_5pct) * 100;
          const noChangeRate = intra.all.no_change * 100;

          return (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div
                  className="rounded-lg p-6 border"
                  style={{
                    backgroundColor: 'var(--chart-winners-bg)',
                    borderColor: COLORS.positive,
                  }}
                >
                  <p className="text-sm text-gray-700 mb-2">Winners</p>
                  <p
                    className="text-3xl font-bold"
                    style={{ color: COLORS.gainMore5 }}
                  >
                    {winnersRate.toFixed(1)}%
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    of Missouri households gain
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-6 border border-gray-300">
                  <p className="text-sm text-gray-700 mb-2">No change</p>
                  <p className="text-3xl font-bold text-gray-600">
                    {noChangeRate.toFixed(1)}%
                  </p>
                </div>
                <div
                  className="rounded-lg p-6 border"
                  style={{
                    backgroundColor: 'var(--chart-losers-bg)',
                    borderColor: COLORS.loseMore5,
                  }}
                >
                  <p className="text-sm text-gray-700 mb-2">Losers</p>
                  <p
                    className="text-3xl font-bold"
                    style={{ color: COLORS.loseMore5 }}
                  >
                    {losersRate.toFixed(1)}%
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    of Missouri households lose
                  </p>
                </div>
              </div>

              <div className="bg-white border rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">
                  Winners &amp; losers by income decile
                </h3>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart
                    data={stackedData}
                    layout="vertical"
                    stackOffset="expand"
                    barSize={24}
                    margin={CHART_MARGIN}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="var(--chart-grid)"
                    />
                    <XAxis
                      type="number"
                      tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                      tick={TICK_STYLE}
                      stroke="var(--chart-axis)"
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tick={TICK_STYLE}
                      stroke="var(--chart-axis)"
                      width={40}
                    />
                    <Tooltip
                      content={
                        <CustomTooltip formatter={(v) => `${v.toFixed(1)}%`} />
                      }
                    />
                    {categories.map((c) => (
                      <Bar
                        key={c.key}
                        dataKey={c.key}
                        stackId="a"
                        fill={c.color}
                        name={c.label}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
                <ChartWatermark />
                <div className="flex flex-wrap justify-center gap-4 mt-4">
                  {categories.map((c) => (
                    <div key={c.key} className="flex items-center gap-1.5">
                      <div
                        className="w-3 h-3 rounded-sm"
                        style={{ backgroundColor: c.color }}
                      />
                      <span
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: 12,
                          color: 'var(--text-body)',
                        }}
                      >
                        {c.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          );
        })()
      ) : null}
    </div>
  );
}
