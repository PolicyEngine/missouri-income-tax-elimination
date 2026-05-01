'use client';

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MO_2025_RATES, REFORM_YEARS } from '@/lib/reform';

/**
 * Rates-over-time chart, one line per editable bracket (1–7), with a
 * dashed reference line for the 2025 baseline.
 *
 * Data shape: each point is `{ year, b1, b2, ..., b7 }` where each
 * `bN` is the marginal rate (in %) for bracket N in that year.
 */

interface Props {
  rates: Record<number, number[]>;
}

const EDITABLE_BRACKETS = [1, 2, 3, 4, 5, 6, 7];

// Teal ramp from light to dark so the highest bracket is the most
// emphasised line. Mirrors the dashboard's primary palette.
const BRACKET_COLORS: Record<number, string> = {
  1: '#A5F3F1',
  2: '#7DD3D1',
  3: '#5CB5B3',
  4: '#3B9897',
  5: '#1F7B7A',
  6: '#0E5F5E',
  7: '#003F3F',
};

export default function RateLineChart({ rates }: Props) {
  const data = REFORM_YEARS.map((year) => {
    const row = rates[year] ?? MO_2025_RATES;
    const point: Record<string, number> = { year };
    for (const i of EDITABLE_BRACKETS) {
      point[`b${i}`] = +(row[i] * 100).toFixed(2);
    }
    return point;
  });

  const baselineMax = MO_2025_RATES[7] * 100;
  const niceMax = Math.max(baselineMax, 5);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-800">Rates over time</h3>
        <span className="text-xs text-gray-500">marginal rate, by bracket</span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            stroke="#9ca3af"
          />
          <YAxis
            domain={[0, niceMax]}
            tickFormatter={(v) => `${v.toFixed(1)}%`}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            stroke="#9ca3af"
            width={50}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 4,
              border: '1px solid #e5e7eb',
            }}
            formatter={(value: number, name: string) => [
              `${value.toFixed(2)}%`,
              name.replace(/^b/, 'Bracket '),
            ]}
            labelFormatter={(year: number) => `Year ${year}`}
          />
          <Legend
            verticalAlign="bottom"
            iconSize={10}
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(value: string) =>
              `Bracket ${value.replace(/^b/, '')}`
            }
          />
          {EDITABLE_BRACKETS.map((i) => (
            <Line
              key={i}
              type="monotone"
              dataKey={`b${i}`}
              stroke={BRACKET_COLORS[i]}
              strokeWidth={2}
              dot={{ r: 2.5 }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-2 text-[11px] text-gray-500">
        Bracket 7 is the top marginal rate (4.7% baseline). Bracket 1 is the
        lowest non-zero band (2.0% baseline). Years before the wizard&apos;s
        start year are left at baseline.
      </p>
    </div>
  );
}
