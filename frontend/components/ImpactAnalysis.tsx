'use client';

import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { HouseholdRequest } from '@/lib/types';
import type { YearHouseholdImpact } from '@/hooks/useMultiYearHouseholdImpact';
import ChartWatermark from './ChartWatermark';

interface Props {
  years: YearHouseholdImpact[];
  baseRequest: Omit<HouseholdRequest, 'year'> | null;
  maxEarnings?: number;
}

const YEAR_LIST = [
  2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035,
];
const MIN_YEAR = YEAR_LIST[0];
const MAX_YEAR = YEAR_LIST[YEAR_LIST.length - 1];

export default function ImpactAnalysis({ years, baseRequest, maxEarnings }: Props) {
  const [selectedYear, setSelectedYear] = useState<number>(MIN_YEAR);

  // When the set of available years changes (new run resets years, or the
  // list re-populates), make sure the selected year is still valid.
  const yearsLength = years.length;
  useEffect(() => {
    if (yearsLength > 0) {
      setSelectedYear((prev) =>
        years.some((y) => y.year === prev) ? prev : MIN_YEAR,
      );
    }
    // `years` identity changes every render as statuses update; only react
    // to length changes (new run / reset).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearsLength]);

  if (years.length === 0 || !baseRequest) return null;

  const current = years.find((y) => y.year === selectedYear);
  const completedCount = years.filter((y) => y.status === 'ok').length;
  const totalCount = years.length;

  const handlePrev = () => {
    setSelectedYear((y) => Math.max(MIN_YEAR, y - 1));
  };
  const handleNext = () => {
    setSelectedYear((y) => Math.min(MAX_YEAR, y + 1));
  };

  const formatCurrency = (value: number) =>
    `$${Math.round(value).toLocaleString('en-US')}`;

  const navigator = (
    <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
      <button
        onClick={handlePrev}
        disabled={selectedYear <= MIN_YEAR}
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
        onClick={handleNext}
        disabled={selectedYear >= MAX_YEAR}
        aria-label="Next year"
        className="px-3 py-1.5 rounded-md bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium"
      >
        {'\u25B6'}
      </button>
    </div>
  );

  // Body content depends on the current year's status.
  let body: React.ReactNode;

  if (!current || current.status === 'pending' || current.status === 'computing') {
    body = (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-gray-600">
            Calculating impact for {selectedYear}...
          </p>
        </div>
      </div>
    );
  } else if (current.status === 'error') {
    const errorMessage = current.error ?? 'Unknown error';
    const isApiNotUpdated =
      errorMessage.includes('500') || errorMessage.includes('too many values');
    body = (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <h2 className="text-yellow-800 font-semibold mb-2">
          Household calculator temporarily unavailable for {selectedYear}
        </h2>
        {isApiNotUpdated ? (
          <p className="text-yellow-700">
            The PolicyEngine API is temporarily unavailable. Please try again in a moment.
          </p>
        ) : (
          <p className="text-yellow-700">{errorMessage}</p>
        )}
      </div>
    );
  } else {
    // status === 'ok' and data is defined
    const data = current.data!;

    const formatCurrencyWithSign = (value: number) => {
      const formatted = formatCurrency(Math.abs(value));
      if (value > 0) return `+${formatted}`;
      if (value < 0) return `-${formatted}`;
      return formatted;
    };
    const formatIncome = (value: number) => {
      if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
      return `$${(value / 1000).toFixed(0)}k`;
    };

    const benefitData = data.benefit_at_income;
    const federalTaxChangePoint =
      benefitData.federal_tax_change ?? -benefitData.federal_eitc_change;
    const stateTaxChangePoint =
      benefitData.state_tax_change ?? -benefitData.state_eitc_change;
    const netIncomeChangePoint =
      benefitData.net_income_change ?? benefitData.difference;

    const xMax = maxEarnings ?? data.x_axis_max;

    const federalTaxChangeSeries: number[] =
      data.federalTaxChange ?? data.net_income_change.map(() => 0);
    const stateTaxChangeSeries: number[] =
      data.stateTaxChange ?? data.net_income_change.map(() => 0);
    const netIncomeChangeSeries: number[] =
      data.netIncomeChange ?? data.net_income_change;

    const chartData = data.income_range
      .map((inc, i) => ({
        income: inc,
        benefit: netIncomeChangeSeries[i],
        federalTaxChange: federalTaxChangeSeries[i],
        stateTaxChange: stateTaxChangeSeries[i],
        netIncomeChange: netIncomeChangeSeries[i],
      }))
      .filter((d) => d.income <= xMax);

    const metricCard = (label: string, value: number, lowerIsBetter = false) => {
      const beneficial = lowerIsBetter ? value < 0 : value > 0;
      const harmful = lowerIsBetter ? value > 0 : value < 0;
      return (
        <div
          className={`rounded-lg p-6 border ${
            beneficial
              ? 'bg-green-50 border-success'
              : harmful
              ? 'bg-red-50 border-red-300'
              : 'bg-gray-50 border-gray-300'
          }`}
        >
          <p className="text-sm text-gray-700 mb-2">{label}</p>
          <p
            className={`text-3xl font-bold ${
              beneficial ? 'text-green-600' : harmful ? 'text-red-600' : 'text-gray-600'
            }`}
          >
            {value !== 0 ? `${formatCurrencyWithSign(value)}/year` : '$0/year'}
          </p>
        </div>
      );
    };

    const HoverTooltip = ({
      active,
      payload,
      label,
    }: {
      active?: boolean;
      payload?: Array<{ payload: {
        income: number;
        federalTaxChange: number;
        stateTaxChange: number;
        netIncomeChange: number;
      } }>;
      label?: number;
    }) => {
      if (!active || !payload || !payload.length) return null;
      const p = payload[0].payload;
      const incomeLabel = typeof label === 'number' ? label : p.income;
      return (
        <div
          style={{
            background: 'var(--chart-tooltip-bg, #fff)',
            border: '1px solid var(--chart-tooltip-border, #e5e7eb)',
            borderRadius: 4,
            padding: '8px 12px',
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
          }}
        >
          <p style={{ margin: '0 0 4px', fontWeight: 600 }}>
            Income: {formatCurrency(Math.round(incomeLabel / 100) * 100)}
          </p>
          <p style={{ margin: 0 }}>
            Federal tax change: {formatCurrencyWithSign(p.federalTaxChange)}
          </p>
          <p style={{ margin: 0 }}>
            Missouri state tax change: {formatCurrencyWithSign(p.stateTaxChange)}
          </p>
          <p style={{ margin: 0, fontWeight: 600 }}>
            Net income change: {formatCurrencyWithSign(p.netIncomeChange)}
          </p>
        </div>
      );
    };

    body = (
      <div className="space-y-8">
        {/* Personal impact */}
        <div>
          <h3 className="text-xl font-bold text-gray-800 mb-4">
            Your household impact from the selected Missouri reform ({selectedYear})
          </h3>
          <p className="text-gray-600 mb-4">
            Based on your employment income of <strong>{formatCurrency(baseRequest.income)}</strong>,
            comparing the reform to current law.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {metricCard('Federal tax change', federalTaxChangePoint, true)}
            {metricCard('Missouri state tax change', stateTaxChangePoint, true)}
            {metricCard('Net income change', netIncomeChangePoint)}
          </div>
        </div>

        <hr className="border-gray-200" />

        {/* Chart */}
        <div className="bg-white border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-1 text-gray-800">
            Change in net income under the selected Missouri reform ({selectedYear})
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Reform vs. current law, by employment income
          </p>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData} margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis
                dataKey="income"
                type="number"
                tickFormatter={formatIncome}
                stroke="var(--chart-reference)"
                domain={[0, xMax]}
                allowDataOverflow={false}
              />
              <YAxis tickFormatter={formatCurrency} stroke="var(--chart-reference)" width={80} />
              <Tooltip content={<HoverTooltip />} />
              <Legend />
              <ReferenceLine y={0} stroke="var(--chart-reference)" strokeWidth={2} />
              <Line
                type="monotone"
                dataKey="benefit"
                stroke="var(--chart-positive)"
                strokeWidth={3}
                name="Net income change"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <ChartWatermark />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-primary">Impact analysis</h2>
      {navigator}
      {body}
    </div>
  );
}
