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
import type { YearEconomyImpact } from '@/hooks/useFullEconomyImpact';
import ChartWatermark from './ChartWatermark';
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
          {label}
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

const pctChange = (baseline: number, reform: number) => {
  if (!baseline || baseline === 0) return 0;
  return ((reform - baseline) / baseline) * 100;
};

export default function PovertyImpact({ years, running }: Props) {
  const [selectedYear, setSelectedYear] = useState(2027);

  if (!years.length) return null;

  const yearData = years.find((y) => y.year === selectedYear);
  const completed = years.filter((y) => y.status === 'ok').length;
  const total = years.length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-primary">Poverty impact</h2>
        <p className="text-sm text-gray-600 mt-1">
          Percent change in Missouri Supplemental Poverty Measure rates under
          the reform, compared to current law.
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
          {yearData.error || 'Failed to load poverty impact for this year.'}
        </div>
      ) : yearData?.poverty ? (
        (() => {
          const pov = yearData.poverty;
          const povertyData = [
            {
              label: 'Overall',
              value: pctChange(pov.poverty.all.baseline, pov.poverty.all.reform),
            },
            {
              label: 'Child',
              value: pctChange(pov.poverty.child.baseline, pov.poverty.child.reform),
            },
            {
              label: 'Deep',
              value: pctChange(
                pov.deep_poverty.all.baseline,
                pov.deep_poverty.all.reform,
              ),
            },
            {
              label: 'Deep child',
              value: pctChange(
                pov.deep_poverty.child.baseline,
                pov.deep_poverty.child.reform,
              ),
            },
          ];
          const povMaxAbs = Math.max(
            ...povertyData.map((d) => Math.abs(d.value)),
            0.01,
          );
          const povNiceStep = (() => {
            const rough = povMaxAbs / 3;
            const mag = Math.pow(10, Math.floor(Math.log10(rough || 0.01)));
            const residual = rough / mag;
            if (residual <= 1) return mag;
            if (residual <= 2) return 2 * mag;
            if (residual <= 5) return 5 * mag;
            return 10 * mag;
          })();
          const povNiceMax = Math.ceil(povMaxAbs / povNiceStep) * povNiceStep;
          const povDomain: [number, number] = [-povNiceMax, povNiceMax];
          const povTicks = Array.from(
            { length: Math.round((2 * povNiceMax) / povNiceStep) + 1 },
            (_, i) => -povNiceMax + i * povNiceStep,
          );

          return (
            <div className="bg-white border rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">
                Change in poverty rates ({selectedYear})
              </h3>
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={povertyData} margin={CHART_MARGIN}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="var(--chart-grid)"
                  />
                  <XAxis
                    dataKey="label"
                    tick={TICK_STYLE}
                    stroke="var(--chart-axis)"
                    label={{
                      value: 'Poverty measure',
                      position: 'insideBottom',
                      offset: -15,
                      style: {
                        ...TICK_STYLE,
                        fill: 'var(--chart-axis-label)',
                      },
                    }}
                  />
                  <YAxis
                    domain={povDomain}
                    ticks={povTicks}
                    tickFormatter={(v: number) =>
                      `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
                    }
                    tick={TICK_STYLE}
                    stroke="var(--chart-axis)"
                    width={70}
                  />
                  <Tooltip
                    content={
                      <CustomTooltip
                        formatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`}
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
                    name="Change in poverty rate"
                    radius={[2, 2, 0, 0]}
                  >
                    {povertyData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={d.value < 0 ? COLORS.positive : COLORS.negative}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <ChartWatermark />
              <p className="text-xs text-gray-500 mt-3 italic">
                Negative values mean poverty falls under the reform.
              </p>
            </div>
          );
        })()
      ) : null}
    </div>
  );
}
