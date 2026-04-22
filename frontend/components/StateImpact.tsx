'use client';

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
import type { YearImpact } from '@/hooks/useStateImpact';
import ChartWatermark from './ChartWatermark';

const COLORS = {
  positive: 'var(--chart-positive)',
  negative: 'var(--chart-negative)',
};

const CHART_MARGIN = { top: 20, right: 20, bottom: 30, left: 70 };
const TICK_STYLE = { fontFamily: 'var(--font-sans)', fontSize: 12 };

interface Props {
  years: YearImpact[];
  running: boolean;
}

function formatMagnitude(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : value > 0 ? '+' : '';
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

function formatAxis(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(0)}k`;
  return `$${value}`;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; payload: { year: number; stateRevenue: number } }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
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
      <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Year {label ?? p.year}</p>
      <p style={{ margin: 0 }}>
        State revenue change: {formatMagnitude(p.stateRevenue)}
      </p>
    </div>
  );
}

export default function StateImpact({ years, running }: Props) {
  if (!years.length) return null;

  const completed = years.filter((y) => y.status === 'ok').length;
  const total = years.length;

  // Build chart rows for completed years, preserving chronological order.
  const chartData = years.map((y) => ({
    year: y.year,
    stateRevenue:
      y.status === 'ok' && y.budget
        ? y.budget.state_tax_revenue_impact
        : 0,
    status: y.status,
  }));

  const completedYears = years.filter((y) => y.status === 'ok');
  const tenYearTotal = completedYears.reduce(
    (acc, y) => acc + (y.budget?.state_tax_revenue_impact ?? 0),
    0,
  );

  let cumulative = 0;
  const tableRows = years.map((y) => {
    const val = y.budget?.state_tax_revenue_impact ?? 0;
    if (y.status === 'ok') cumulative += val;
    return {
      year: y.year,
      stateRevenue: y.status === 'ok' ? val : null,
      cumulative: y.status === 'ok' ? cumulative : null,
      status: y.status,
    };
  });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-primary">
          10-year state revenue impact
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Change in Missouri state tax revenue under the chosen reform,
          compared to current law. Negative values mean lost revenue (a cost
          to the state).
        </p>
      </div>

      {running && (
        <div className="rounded-lg border border-primary-200 bg-primary-50 p-4 text-sm text-primary-800">
          Simulating Missouri impact &mdash; <strong>{completed}</strong> of{' '}
          <strong>{total}</strong> years complete&hellip;
        </div>
      )}

      {/* Summary card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-600 mb-2">
            10-year total state revenue change
          </p>
          <p
            className={`text-3xl font-bold ${
              tenYearTotal < 0
                ? 'text-red-600'
                : tenYearTotal > 0
                  ? 'text-green-600'
                  : 'text-gray-600'
            }`}
          >
            {completedYears.length > 0
              ? formatMagnitude(tenYearTotal)
              : '—'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Sum of state revenue change, 2026&ndash;2035
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-600 mb-2">Years completed</p>
          <p className="text-3xl font-bold text-gray-900">
            {completed} / {total}
          </p>
          {running && (
            <p className="text-xs text-gray-500 mt-1">
              Simulation in progress&hellip;
            </p>
          )}
        </div>
      </div>

      {/* Bar chart */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-1 text-gray-800">
          State revenue change by year
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Missouri state tax revenue impact under the selected reform,
          compared to current law
        </p>
        <ResponsiveContainer width="100%" height={360}>
          <BarChart data={chartData} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis
              dataKey="year"
              stroke="var(--chart-reference)"
              tick={TICK_STYLE}
            />
            <YAxis
              stroke="var(--chart-reference)"
              tick={TICK_STYLE}
              tickFormatter={formatAxis}
              width={80}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="var(--chart-reference)" strokeWidth={1} />
            <Bar dataKey="stateRevenue" name="State revenue change">
              {chartData.map((d, i) => (
                <Cell
                  key={i}
                  fill={
                    d.status !== 'ok'
                      ? 'var(--chart-no-change)'
                      : d.stateRevenue < 0
                        ? COLORS.negative
                        : COLORS.positive
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <ChartWatermark />
      </div>

      {/* Table */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">
          Year-by-year impact
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 font-semibold text-gray-900">
                  Year
                </th>
                <th className="text-right py-2 px-3 font-semibold text-gray-900">
                  State revenue change
                </th>
                <th className="text-right py-2 px-3 font-semibold text-gray-900">
                  Cumulative
                </th>
                <th className="text-left py-2 px-3 font-semibold text-gray-900">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => (
                <tr key={r.year} className="border-b border-gray-100">
                  <td className="py-2 px-3 text-gray-700">{r.year}</td>
                  <td className="py-2 px-3 text-right text-gray-700">
                    {r.stateRevenue === null
                      ? '—'
                      : formatMagnitude(r.stateRevenue)}
                  </td>
                  <td className="py-2 px-3 text-right text-gray-700">
                    {r.cumulative === null
                      ? '—'
                      : formatMagnitude(r.cumulative)}
                  </td>
                  <td className="py-2 px-3 text-left">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: YearImpact['status'] }) {
  const styles: Record<YearImpact['status'], string> = {
    pending: 'bg-gray-100 text-gray-600',
    computing: 'bg-yellow-100 text-yellow-800',
    ok: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800',
  };
  const labels: Record<YearImpact['status'], string> = {
    pending: 'Pending',
    computing: 'Computing…',
    ok: 'Complete',
    error: 'Error',
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}
