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
  ReferenceLine,
  Cell,
} from 'recharts';
import type { YearEconomyImpact } from '@/hooks/useEconomyImpact';
import ChartWatermark from './ChartWatermark';
import Spinner from './Spinner';
import YearPicker from './YearPicker';

const COLORS = {
  positive: 'var(--chart-positive)',
  negative: 'var(--chart-negative)',
};
const CHART_MARGIN = { top: 20, right: 20, bottom: 30, left: 60 };
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
          Decile {label}
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

const formatCurrencyWithSign = (value: number) => {
  const abs = Math.abs(Math.round(value));
  const formatted = `$${abs.toLocaleString('en-US')}`;
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
};

export default function DistributionalImpact({ years, running }: Props) {
  const [selectedYear, setSelectedYear] = useState(2027);
  const [mode, setMode] = useState<'relative' | 'absolute'>('relative');

  if (!years.length) return null;

  const yearData = years.find((y) => y.year === selectedYear);
  const completed = years.filter((y) => y.status === 'ok').length;
  const total = years.length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-primary">
          Distributional impact by income decile
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Change in household net income under the chosen reform, compared to
          current law. Households are ranked by income and split into ten
          deciles.
        </p>
      </div>

      {running && (
        <div className="rounded-lg border border-primary-200 bg-primary-50 p-4 text-sm text-primary-800">
          <Spinner
            size="sm"
            label={
              <>
                Computing economy-wide impacts &mdash;{' '}
                <strong>{completed}</strong> of <strong>{total}</strong> years
                complete&hellip;
              </>
            }
          />
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <YearPicker
          years={years}
          selectedYear={selectedYear}
          onChange={setSelectedYear}
        />
        <div className="flex gap-1">
          {(['relative', 'absolute'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                mode === m
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {m === 'relative' ? 'Relative' : 'Absolute'}
            </button>
          ))}
        </div>
      </div>

      {yearData?.status === 'computing' || yearData?.status === 'pending' ? (
        <div className="bg-white border rounded-lg">
          <Spinner label={`Computing distributional impact for ${selectedYear}\u2026`} />
        </div>
      ) : yearData?.status === 'error' ? (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          {yearData.error || 'Failed to load distributional impact for this year.'}
        </div>
      ) : yearData?.decile ? (
        (() => {
          const isRelative = mode === 'relative';
          const decile = yearData.decile;
          const rawValues = isRelative
            ? Object.values(decile.relative).map((v) => v * 100)
            : Object.values(decile.average);
          const maxAbs = Math.max(...rawValues.map(Math.abs), 0.01);
          const niceStep = (() => {
            const rough = maxAbs / 3;
            const mag = Math.pow(10, Math.floor(Math.log10(rough || 0.01)));
            const residual = rough / mag;
            if (residual <= 1) return mag;
            if (residual <= 2) return 2 * mag;
            if (residual <= 5) return 5 * mag;
            return 10 * mag;
          })();
          const niceMax = Math.ceil(maxAbs / niceStep) * niceStep;
          const symmetricDomain: [number, number] = [-niceMax, niceMax];
          const niceTicks = Array.from(
            { length: Math.round((2 * niceMax) / niceStep) + 1 },
            (_, i) => -niceMax + i * niceStep,
          );
          const chartData = isRelative
            ? Object.entries(decile.relative).map(([k, v]) => ({
                decile: k,
                value: v * 100,
              }))
            : Object.entries(decile.average).map(([k, v]) => ({
                decile: k,
                value: v,
              }));

          return (
            <div className="bg-white border rounded-lg p-6">
              <p className="text-gray-700 mb-3">
                {isRelative
                  ? 'Change as a percentage of baseline household net income, by decile.'
                  : 'Average dollar change in household net income, by decile.'}
              </p>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={chartData} margin={CHART_MARGIN}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="var(--chart-grid)"
                  />
                  <XAxis
                    dataKey="decile"
                    tick={TICK_STYLE}
                    stroke="var(--chart-axis)"
                    label={{
                      value: 'Income decile',
                      position: 'insideBottom',
                      offset: -15,
                      style: {
                        ...TICK_STYLE,
                        fill: 'var(--chart-axis-label)',
                      },
                    }}
                  />
                  <YAxis
                    domain={symmetricDomain}
                    ticks={niceTicks}
                    tickFormatter={
                      isRelative
                        ? (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
                        : formatCurrencyWithSign
                    }
                    tick={TICK_STYLE}
                    stroke="var(--chart-axis)"
                    width={isRelative ? 60 : 80}
                    allowDecimals={false}
                  />
                  <Tooltip
                    content={
                      <CustomTooltip
                        formatter={
                          isRelative
                            ? (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
                            : formatCurrencyWithSign
                        }
                      />
                    }
                  />
                  <ReferenceLine
                    y={0}
                    stroke="var(--chart-axis)"
                    strokeWidth={1}
                  />
                  <Bar
                    dataKey="value"
                    name={isRelative ? 'Relative impact' : 'Average impact'}
                    radius={[2, 2, 0, 0]}
                  >
                    {rawValues.map((v, i) => (
                      <Cell
                        key={i}
                        fill={v >= 0 ? COLORS.positive : COLORS.negative}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <ChartWatermark />
              <p className="text-xs text-gray-500 mt-3 italic">
                Distributional impacts are calculated at the household level.
              </p>
            </div>
          );
        })()
      ) : null}
    </div>
  );
}
