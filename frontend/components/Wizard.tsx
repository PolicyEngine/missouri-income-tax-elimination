'use client';

import { useMemo, useState } from 'react';
import { MO_2025_RATES, REFORM_YEARS, defaultCustomRates } from '@/lib/reform';

/**
 * Guided wizard for the Missouri income tax elimination dashboard.
 *
 * Matches the California wealth tax pattern: progressive steps with a
 * progress bar, OptionCards for path choice, ToggleChips for binary
 * picks, sliders / number inputs for continuous knobs. Results in the
 * sibling column update live as the user advances.
 */

export type ReformPath = 'cap' | 'cut' | 'eliminate' | 'custom';
export type CutUnit = 'pp' | 'pct';

export interface HouseholdProfile {
  income: number;
  age: number;
  married: boolean;
  dependents: number[];
}

export interface ReformConfig {
  /** Top-rate cap config (used when path === 'cap'). */
  cap: {
    startYear: number;
    endYear: number;
    startPct: number;
    endPct: number;
  };
  /** Across-the-board cut config (used when path === 'cut'). The unit
   *  toggles between "pp" (subtract pp from each bracket) and "pct"
   *  (proportional cut as a share of the baseline rate). */
  cut: {
    unit: CutUnit;
    startYear: number;
    endYear: number;
    /** Magnitude at startYear; pp is a percentage-point amount, pct is
     *  the share removed (0–1, e.g. 0.20 = drop rates by 20%). */
    startMag: number;
    /** Magnitude at endYear. */
    endMag: number;
  };
  /** Phased full-elimination config: rates ramp from baseline at
   *  `startYear` down to zero at `endYear`. */
  eliminate: {
    startYear: number;
    endYear: number;
  };
  /** Custom matrix override (only used when path === 'custom'). */
  customRates: Record<number, number[]>;
}

export const DEFAULT_REFORM_CONFIG: ReformConfig = {
  cap: { startYear: 2027, endYear: 2035, startPct: 4.7, endPct: 3.0 },
  cut: { unit: 'pp', startYear: 2027, endYear: 2035, startMag: 0, endMag: 1.5 },
  eliminate: { startYear: 2027, endYear: 2035 },
  customRates: defaultCustomRates(),
};

interface Props {
  path: ReformPath | null;
  onPathChange: (p: ReformPath) => void;
  config: ReformConfig;
  onConfigChange: (c: ReformConfig) => void;
  household: HouseholdProfile;
  onHouseholdChange: (h: HouseholdProfile) => void;
  /** Fires when the wizard's first non-intro step completes — the parent
   * then shows results in the sibling column. */
  onShowResults: () => void;
  /** Fires on the Done step — the parent kicks the calc and may collapse
   * the wizard into a summary card. */
  onDone: () => void;
}

const STEP_IDS = [
  'intro',
  'path',
  'ramp',
  'magnitude',
  'household',
  'review',
] as const;
type StepId = (typeof STEP_IDS)[number];

interface StepDef {
  id: StepId;
  showFor: (path: ReformPath | null) => boolean;
}

const STEPS: StepDef[] = [
  { id: 'intro', showFor: () => true },
  { id: 'path', showFor: () => true },
  // Cap folds years + rates onto the magnitude step. Cut and eliminate
  // keep ramp (years) separate from magnitude.
  { id: 'ramp', showFor: (p) => p === 'cut' || p === 'eliminate' },
  { id: 'magnitude', showFor: (p) => p === 'cap' || p === 'cut' },
  { id: 'household', showFor: () => true },
  { id: 'review', showFor: () => true },
];

function visibleSteps(path: ReformPath | null) {
  return STEPS.filter((s) => s.showFor(path));
}

function StepShell({
  stepIndex,
  totalSteps,
  title,
  subtitle,
  children,
}: {
  stepIndex: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.1em] text-gray-400">
          {stepIndex + 1} / {totalSteps}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-primary-500 transition-all duration-300"
            style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
          />
        </div>
      </div>
      <div>
        <h4 className="text-lg font-semibold tracking-tight text-gray-800">
          {title}
        </h4>
        {subtitle && (
          <p className="mt-1 text-sm leading-6 text-gray-500">{subtitle}</p>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function OptionCard({
  selected,
  onClick,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border px-5 py-4 text-left transition-colors ${
        selected
          ? 'border-primary-500 bg-primary-50'
          : 'border-gray-200 bg-white hover:border-primary-200 hover:bg-primary-50/40'
      }`}
    >
      <span className="text-sm font-semibold text-gray-800">{title}</span>
      {description && (
        <p className="mt-1 text-xs leading-5 text-gray-500">{description}</p>
      )}
    </button>
  );
}

function PctInput({
  value,
  onChange,
  max = 10,
  suffix = '%',
}: {
  value: number;
  onChange: (v: number) => void;
  max?: number;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        min={0}
        max={max}
        step={0.1}
        value={value}
        onChange={(e) => {
          const raw = Number(e.target.value);
          if (isNaN(raw)) return;
          onChange(Math.max(0, Math.min(max, raw)));
        }}
        className="w-24 pl-3 pr-8 py-2 bg-white border border-gray-200 rounded-md text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
      />
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">
        {suffix}
      </span>
    </div>
  );
}

function YearSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="px-2.5 py-2 bg-white border border-gray-200 rounded-md text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
      aria-label="Ramp year"
    >
      {REFORM_YEARS.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}

const PATH_LABELS: Record<ReformPath, string> = {
  cap: 'Top-rate cap',
  cut: 'Across-the-board cut',
  eliminate: 'Phase out',
  custom: 'Custom rate matrix',
};

const PATH_DESCRIPTIONS: Record<ReformPath, string> = {
  cap: 'Cap the top marginal rate at a chosen value, optionally ramping over multiple years.',
  cut: 'Lower every bracket each year, either by a fixed number of percentage points or by a share of its baseline rate. Ramps linearly between the start and end years.',
  eliminate: 'Phase every bracket from its 2025 baseline down to zero between two chosen years.',
  custom: 'Edit the year × bracket rate matrix directly.',
};

export default function Wizard({
  path,
  onPathChange,
  config,
  onConfigChange,
  household,
  onHouseholdChange,
  onShowResults,
  onDone,
}: Props) {
  const [step, setStep] = useState(0);
  const steps = useMemo(() => visibleSteps(path), [path]);
  const clampedStep = Math.min(step, steps.length - 1);
  const currentStep = steps[clampedStep];
  const isLastStep = clampedStep >= steps.length - 1;
  const canAdvance = currentStep?.id === 'path' ? path !== null : true;

  const update = <K extends keyof ReformConfig>(key: K, value: ReformConfig[K]) =>
    onConfigChange({ ...config, [key]: value });
  const updateCap = (patch: Partial<ReformConfig['cap']>) =>
    update('cap', { ...config.cap, ...patch });
  const updateCut = (patch: Partial<ReformConfig['cut']>) =>
    update('cut', { ...config.cut, ...patch });
  const updateEliminate = (patch: Partial<ReformConfig['eliminate']>) =>
    update('eliminate', { ...config.eliminate, ...patch });
  const updateHousehold = (patch: Partial<HouseholdProfile>) =>
    onHouseholdChange({ ...household, ...patch });

  function next() {
    if (isLastStep) {
      onDone();
      return;
    }
    if (currentStep?.id === 'path') {
      onShowResults();
    }
    setStep(clampedStep + 1);
  }

  function back() {
    if (clampedStep > 0) setStep(clampedStep - 1);
  }

  function renderStep() {
    if (!currentStep) return null;
    switch (currentStep.id) {
      case 'intro':
        return (
          <StepShell
            stepIndex={clampedStep}
            totalSteps={steps.length}
            title="What does this calculator do?"
            subtitle="Score paths to lowering or eliminating Missouri's individual income tax over the next decade."
          >
            <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm leading-6 text-gray-600">
              <p>
                Missouri taxes individual income with a graduated bracket
                schedule that tops out at <strong>4.7%</strong> in 2025. This
                tool models four paths to lowering or eliminating that tax,
                year by year from <strong>2027 through 2035</strong>, and
                reports household-level and statewide fiscal impacts.
              </p>
              <p className="mt-3">
                The next step lets you pick a starting point. The results
                panel updates live as you adjust each assumption.
              </p>
            </div>
          </StepShell>
        );

      case 'path':
        return (
          <StepShell
            stepIndex={clampedStep}
            totalSteps={steps.length}
            title="Choose a starting point"
            subtitle="Pick the kind of reform to model. You can change it any time."
          >
            {(Object.keys(PATH_LABELS) as ReformPath[]).map((p) => (
              <OptionCard
                key={p}
                selected={path === p}
                onClick={() => onPathChange(p)}
                title={PATH_LABELS[p]}
                description={PATH_DESCRIPTIONS[p]}
              />
            ))}
          </StepShell>
        );

      case 'ramp': {
        const rampConfig =
          path === 'cap'
            ? config.cap
            : path === 'cut'
              ? config.cut
              : config.eliminate;
        const setRamp = (patch: { startYear?: number; endYear?: number }) => {
          if (path === 'cap') updateCap(patch);
          else if (path === 'cut') updateCut(patch);
          else updateEliminate(patch);
        };
        return (
          <StepShell
            stepIndex={clampedStep}
            totalSteps={steps.length}
            title={
              path === 'eliminate'
                ? 'How fast does the phase-out happen?'
                : 'When does it phase in?'
            }
            subtitle={
              path === 'eliminate'
                ? 'Rates ramp linearly from the 2025 baseline at the start year down to zero at the end year.'
                : 'Pick the start and end year. The change ramps linearly between them; years before the start year are left untouched.'
            }
          >
            <div className="space-y-3 rounded-2xl border border-gray-200 bg-white px-5 py-4">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <span className="font-medium">Start year</span>
                <YearSelect
                  value={rampConfig.startYear}
                  onChange={(v) => setRamp({ startYear: v })}
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <span className="font-medium">End year</span>
                <YearSelect
                  value={rampConfig.endYear}
                  onChange={(v) => setRamp({ endYear: v })}
                />
              </div>
            </div>
          </StepShell>
        );
      }

      case 'magnitude':
        if (path === 'cap') {
          return (
            <StepShell
              stepIndex={clampedStep}
              totalSteps={steps.length}
              title="Set the cap"
              subtitle="Pick the start and end year and the top marginal rate at each. The cap is interpolated linearly between."
            >
              <div className="space-y-3 rounded-2xl border border-gray-200 bg-white px-5 py-4">
                <div className="grid grid-cols-[5rem_1fr_1fr] items-center gap-3 text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                  <span></span>
                  <span>Year</span>
                  <span>Cap</span>
                </div>
                <div className="grid grid-cols-[5rem_1fr_1fr] items-center gap-3 text-sm text-gray-700">
                  <span className="font-medium">Start</span>
                  <YearSelect
                    value={config.cap.startYear}
                    onChange={(v) => updateCap({ startYear: v })}
                  />
                  <PctInput
                    value={config.cap.startPct}
                    onChange={(v) => updateCap({ startPct: v })}
                    max={4.7}
                  />
                </div>
                <div className="grid grid-cols-[5rem_1fr_1fr] items-center gap-3 text-sm text-gray-700">
                  <span className="font-medium">End</span>
                  <YearSelect
                    value={config.cap.endYear}
                    onChange={(v) => updateCap({ endYear: v })}
                  />
                  <PctInput
                    value={config.cap.endPct}
                    onChange={(v) => updateCap({ endPct: v })}
                    max={4.7}
                  />
                </div>
                <p className="text-xs leading-5 text-gray-500">
                  Cells whose current rate exceeds that year&apos;s cap drop
                  to it. Cells already at or below the cap are unaffected.
                  Years before the start year are unchanged.
                </p>
              </div>
            </StepShell>
          );
        }
        // cut path: pp ↔ pct toggle + magnitude inputs
        return (
          <StepShell
            stepIndex={clampedStep}
            totalSteps={steps.length}
            title="How big is the cut?"
            subtitle="Choose the unit and set the magnitude at the start and end years."
          >
            <div className="space-y-4 rounded-2xl border border-gray-200 bg-white px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
                  Unit
                </span>
                <button
                  type="button"
                  onClick={() => updateCut({ unit: 'pp' })}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    config.cut.unit === 'pp'
                      ? 'border-primary-500 bg-primary-500 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-primary-200 hover:bg-primary-50/40'
                  }`}
                >
                  Percentage points
                </button>
                <button
                  type="button"
                  onClick={() => updateCut({ unit: 'pct' })}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    config.cut.unit === 'pct'
                      ? 'border-primary-500 bg-primary-500 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-primary-200 hover:bg-primary-50/40'
                  }`}
                >
                  Share of baseline
                </button>
              </div>

              <div className="flex items-center gap-3 text-sm text-gray-700">
                <span className="w-28 font-medium">
                  {config.cut.startYear} cut
                </span>
                {config.cut.unit === 'pp' ? (
                  <PctInput
                    value={config.cut.startMag}
                    onChange={(v) => updateCut({ startMag: v })}
                    max={4.7}
                    suffix="pp"
                  />
                ) : (
                  <PctInput
                    value={+(config.cut.startMag * 100).toFixed(1)}
                    onChange={(v) => updateCut({ startMag: v / 100 })}
                    max={100}
                    suffix="%"
                  />
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-700">
                <span className="w-28 font-medium">
                  {config.cut.endYear} cut
                </span>
                {config.cut.unit === 'pp' ? (
                  <PctInput
                    value={config.cut.endMag}
                    onChange={(v) => updateCut({ endMag: v })}
                    max={4.7}
                    suffix="pp"
                  />
                ) : (
                  <PctInput
                    value={+(config.cut.endMag * 100).toFixed(1)}
                    onChange={(v) => updateCut({ endMag: v / 100 })}
                    max={100}
                    suffix="%"
                  />
                )}
              </div>
              <p className="text-xs leading-5 text-gray-500">
                {config.cut.unit === 'pp'
                  ? 'Each bracket falls by the interpolated pp amount that year, floored at 0. Years strictly before the start year are unchanged.'
                  : 'Each bracket equals its 2025 baseline times (1 − share). 100% means a full elimination at that year.'}
              </p>
            </div>
          </StepShell>
        );

      case 'household':
        return (
          <StepShell
            stepIndex={clampedStep}
            totalSteps={steps.length}
            title="Your household"
            subtitle="The household calculator scores this profile against the chosen reform from 2027 to 2035."
          >
            <div className="space-y-4 rounded-2xl border border-gray-200 bg-white px-5 py-4">
              <label className="block text-sm">
                <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 mb-1.5">
                  Employment income
                </span>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                    $
                  </span>
                  <input
                    type="text"
                    value={household.income.toLocaleString('en-US')}
                    onChange={(e) => {
                      const num = Number(e.target.value.replace(/,/g, ''));
                      updateHousehold({
                        income: isNaN(num) ? 0 : num,
                      });
                    }}
                    className="w-full pl-6 pr-3 py-2 bg-white border border-gray-200 rounded-md text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                  />
                </div>
              </label>
              <label className="block text-sm">
                <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 mb-1.5">
                  Your age
                </span>
                <input
                  type="number"
                  min={18}
                  max={100}
                  value={household.age}
                  onChange={(e) => {
                    const n = Math.max(
                      18,
                      Math.min(100, parseInt(e.target.value) || 18),
                    );
                    updateHousehold({ age: n });
                  }}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={household.married}
                  onChange={(e) =>
                    updateHousehold({ married: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                />
                Married filing jointly
              </label>
              <label className="block text-sm">
                <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 mb-1.5">
                  Number of dependents
                </span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={household.dependents.length}
                  onChange={(e) => {
                    const count = Math.max(
                      0,
                      Math.min(10, parseInt(e.target.value) || 0),
                    );
                    const ages = [...household.dependents];
                    while (ages.length < count) ages.push(5);
                    ages.splice(count);
                    updateHousehold({ dependents: ages });
                  }}
                  className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                />
              </label>
            </div>
          </StepShell>
        );

      case 'review':
        return (
          <StepShell
            stepIndex={clampedStep}
            totalSteps={steps.length}
            title="Review and run"
            subtitle="Confirm your scenario, then click Done to compute statewide revenue and household impacts."
          >
            <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm leading-6 text-gray-700 space-y-2">
              <p>
                <span className="font-semibold">Reform:</span>{' '}
                {path ? PATH_LABELS[path] : '—'}
              </p>
              {path === 'cap' && (
                <p className="text-xs text-gray-500">
                  Top rate capped at {config.cap.startPct}% in{' '}
                  {config.cap.startYear}, ramping to {config.cap.endPct}% in{' '}
                  {config.cap.endYear}.
                </p>
              )}
              {path === 'cut' && (
                <p className="text-xs text-gray-500">
                  {config.cut.unit === 'pp'
                    ? `Every bracket cut by ${config.cut.startMag} pp in ${config.cut.startYear}, ramping to ${config.cut.endMag} pp in ${config.cut.endYear}.`
                    : `Every bracket reduced by ${(config.cut.startMag * 100).toFixed(0)}% of its baseline in ${config.cut.startYear}, ramping to ${(config.cut.endMag * 100).toFixed(0)}% in ${config.cut.endYear}.`}
                </p>
              )}
              {path === 'eliminate' && (
                <p className="text-xs text-gray-500">
                  Income tax phased to zero between {config.eliminate.startYear}
                  {' '}and {config.eliminate.endYear}.
                </p>
              )}
              {path === 'custom' && (
                <p className="text-xs text-gray-500">
                  Edit the year × bracket matrix below. The 2025 baseline
                  rates ({MO_2025_RATES.slice(1).map((r) => `${(r * 100).toFixed(1)}%`).join(' / ')})
                  are pre-filled.
                </p>
              )}
              <p className="pt-2 text-xs text-gray-500">
                Household: ${household.income.toLocaleString('en-US')},
                age {household.age},{' '}
                {household.married ? 'married' : 'single'},{' '}
                {household.dependents.length}{' '}
                {household.dependents.length === 1 ? 'dependent' : 'dependents'}.
              </p>
            </div>
          </StepShell>
        );

      default:
        return null;
    }
  }

  return (
    <div className="space-y-6 pb-28">
      {renderStep()}

      <div className="sticky bottom-0 z-20 -mx-3 border-t border-gray-200 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-4 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            {clampedStep > 0 && (
              <button
                type="button"
                onClick={back}
                className="rounded-full border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-primary-200 hover:bg-primary-50/40 hover:text-primary-700"
              >
                Back
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={next}
            disabled={!canAdvance}
            className={`rounded-full px-6 py-2.5 text-sm font-semibold transition-colors ${
              canAdvance
                ? 'bg-primary-500 text-white hover:bg-primary-600'
                : 'cursor-not-allowed bg-gray-200 text-gray-400'
            }`}
          >
            {isLastStep ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
