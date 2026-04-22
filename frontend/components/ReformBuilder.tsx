'use client';

import type { ReformType } from '@/lib/reform';

interface Props {
  type: ReformType;
  param: number;
  onChange: (type: ReformType, param: number) => void;
}

const REFORM_OPTIONS: {
  id: ReformType;
  label: string;
  description: string;
}[] = [
  {
    id: 'proportional',
    label: 'Proportional rate cut',
    description: 'Reduce every Missouri bracket rate by the same percentage.',
  },
  {
    id: 'top_cap',
    label: 'Top-rate cap',
    description: 'Cap the top 4.7% bracket at a lower rate you choose.',
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
];

export default function ReformBuilder({ type, param, onChange }: Props) {
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
                  onChange={() => onChange(opt.id, defaultParamFor(opt.id))}
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
                    <ProportionalSlider
                      value={param}
                      onChange={(v) => onChange('proportional', v)}
                    />
                  )}

                  {selected && opt.id === 'top_cap' && (
                    <TopCapInput
                      value={param}
                      onChange={(v) => onChange('top_cap', v)}
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

function defaultParamFor(type: ReformType): number {
  if (type === 'proportional') return 0.5;
  if (type === 'top_cap') return 0.03;
  return 0;
}

function ProportionalSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const percent = Math.round(value * 100);
  return (
    <div className="mt-3">
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        Rate reduction: <span className="font-semibold text-gray-900">{percent}%</span>
      </label>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={percent}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-full accent-primary-500"
        aria-label="Rate reduction percentage"
      />
      <div className="flex justify-between text-[10px] text-gray-500 mt-1">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

function TopCapInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const percentValue = +(value * 100).toFixed(2);
  return (
    <div className="mt-3">
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        New top-bracket rate
      </label>
      <div className="relative max-w-[140px]">
        <input
          type="number"
          min={0}
          max={4.7}
          step={0.1}
          value={percentValue}
          onChange={(e) => {
            const raw = Number(e.target.value);
            const clamped = Math.max(0, Math.min(4.7, isNaN(raw) ? 0 : raw));
            onChange(clamped / 100);
          }}
          className="w-full pl-3 pr-8 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
          aria-label="Top-bracket rate"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
          %
        </span>
      </div>
      <p className="text-[11px] text-gray-500 mt-1">
        Current top rate: 4.7%
      </p>
    </div>
  );
}
