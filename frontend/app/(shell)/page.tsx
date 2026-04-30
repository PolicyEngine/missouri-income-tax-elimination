'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ImpactAnalysis from '@/components/ImpactAnalysis';
import PolicyOverview from '@/components/PolicyOverview';
import RateLineChart from '@/components/RateLineChart';
import RateMatrixBuilder from '@/components/RateMatrixBuilder';
import StateImpact from '@/components/StateImpact';
import Wizard, {
  DEFAULT_REFORM_CONFIG,
  type HouseholdProfile,
  type ReformConfig,
  type ReformPath,
} from '@/components/Wizard';
import { useStateImpact } from '@/hooks/useStateImpact';
import { useMultiYearHouseholdImpact } from '@/hooks/useMultiYearHouseholdImpact';
import type { HouseholdRequest } from '@/lib/types';
import { parseHashParams } from '@/lib/embedding';
import {
  buildCapRates,
  buildEliminateRates,
  buildPctRates,
  buildPpRates,
  buildReform,
  defaultCustomRates,
} from '@/lib/reform';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'policy' | 'impact'>('policy');

  const TAB_CONFIG = [
    { id: 'policy' as const, label: 'Overview' },
    { id: 'impact' as const, label: 'Reform & impact' },
  ];

  const handleTabChange = useCallback((tab: 'policy' | 'impact') => {
    setActiveTab(tab);
  }, []);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-primary-500 text-white py-8 px-4 shadow-md">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">
            Missouri Income Tax Elimination Calculator
          </h1>
          <p className="text-lg opacity-90">
            Explore paths to eliminating Missouri&apos;s individual income tax
            &mdash; pick a starting point, dial in the assumptions, and watch
            the household and state impacts update.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Tabs */}
        <div className="flex space-x-1 mb-4" role="tablist">
          {TAB_CONFIG.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
              onClick={() => handleTabChange(tab.id)}
              className={`px-6 py-3 rounded-t-lg font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-primary-600 border-t-4 border-primary-500'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div
          role="tabpanel"
          id={`tabpanel-${activeTab}`}
          className="bg-white rounded-lg shadow-md p-6"
        >
          {activeTab === 'policy' ? <PolicyOverview /> : <ReformImpactTab />}
        </div>
      </div>
    </main>
  );
}

/** Convert the wizard's path + config into the year × bracket matrix that
 * `buildReform('custom', ...)` consumes. The matrix IS the reform. */
function configToCustomRates(
  path: ReformPath | null,
  config: ReformConfig,
): Record<number, number[]> {
  if (path === 'cap') {
    return buildCapRates(
      config.cap.startYear,
      config.cap.endYear,
      config.cap.startPct,
      config.cap.endPct,
    );
  }
  if (path === 'cut') {
    return config.cut.unit === 'pp'
      ? buildPpRates(
          config.cut.startYear,
          config.cut.endYear,
          config.cut.startMag,
          config.cut.endMag,
        )
      : buildPctRates(
          config.cut.startYear,
          config.cut.endYear,
          config.cut.startMag,
          config.cut.endMag,
        );
  }
  if (path === 'eliminate') {
    return buildEliminateRates(
      config.eliminate.startYear,
      config.eliminate.endYear,
    );
  }
  if (path === 'custom') {
    return config.customRates;
  }
  return defaultCustomRates();
}

/** One-line summary of the current scenario for the chip row above the
 * wizard. Returns null when no path is chosen yet. */
function summarizeScenario(
  path: ReformPath | null,
  config: ReformConfig,
): string | null {
  if (path === null) return null;
  if (path === 'cap') {
    const { startYear, endYear, startPct, endPct } = config.cap;
    if (startYear === endYear) return `Cap • ${startYear} • ${startPct}%`;
    return `Cap • ${startYear}→${endYear} • ${startPct}%→${endPct}%`;
  }
  if (path === 'cut') {
    const { unit, startYear, endYear, startMag, endMag } = config.cut;
    if (unit === 'pp') {
      return `Cut • ${startYear}→${endYear} • ${startMag}pp→${endMag}pp`;
    }
    return `Cut • ${startYear}→${endYear} • ${(startMag * 100).toFixed(0)}%→${(endMag * 100).toFixed(0)}%`;
  }
  if (path === 'eliminate') {
    const { startYear, endYear } = config.eliminate;
    return `Phase out • ${startYear}→${endYear}`;
  }
  return 'Custom matrix';
}

/** Two-column wizard + results layout. */
function ReformImpactTab() {
  // Initial household values, optionally hydrated from URL hash.
  const initial = useMemo<HouseholdProfile>(() => {
    if (typeof window === 'undefined') {
      return { income: 50000, age: 35, married: false, dependents: [5] };
    }
    const params = parseHashParams(window.location.hash);
    return {
      income: params.income ?? 50000,
      age: params.age ?? 35,
      married: params.married ?? false,
      dependents: params.dependents ?? [5],
    };
  }, []);

  const [household, setHousehold] = useState<HouseholdProfile>(initial);
  const [path, setPath] = useState<ReformPath | null>(null);
  const [config, setConfig] = useState<ReformConfig>(DEFAULT_REFORM_CONFIG);
  const [showResults, setShowResults] = useState(false);
  const [maxEarnings, setMaxEarnings] = useState(200000);
  const [selectedYear, setSelectedYear] = useState(2027);

  // Submission state — what the running queries are scoped to.
  const [submittedBaseRequest, setSubmittedBaseRequest] = useState<Omit<
    HouseholdRequest,
    'year'
  > | null>(null);
  const [submittedReform, setSubmittedReform] = useState<Record<
    string,
    Record<string, number | boolean>
  >>({});
  const [skipHousehold, setSkipHousehold] = useState(false);
  const [triggered, setTriggered] = useState(false);

  // 9-year household impact orchestration (2027-2035).
  const {
    years: householdYears,
    run: runHouseholdImpact,
    runYear: runYearHousehold,
    reset: resetHouseholdImpact,
  } = useMultiYearHouseholdImpact();

  // 10-year state impact orchestration.
  const {
    years: stateYears,
    running: stateRunning,
    run: runStateImpact,
    reset: resetStateImpact,
  } = useStateImpact();

  // Keep household form in sync with hash changes.
  useEffect(() => {
    const handleHashChange = () => {
      const params = parseHashParams(window.location.hash);
      setHousehold((prev) => ({
        income: params.income ?? prev.income,
        age: params.age ?? prev.age,
        married: params.married ?? prev.married,
        dependents: params.dependents ?? prev.dependents,
      }));
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const buildBaseRequest = (h: HouseholdProfile): Omit<HouseholdRequest, 'year'> => ({
    age_head: h.age,
    age_spouse: h.married ? 35 : null,
    dependent_ages: h.dependents,
    income: h.income,
    max_earnings: maxEarnings,
    state_code: 'MO',
  });

  const handleDone = () => {
    const customRates = configToCustomRates(path, config);
    const baseRequest = buildBaseRequest(household);
    const reform = buildReform('custom', {}, 2027, customRates);
    setSubmittedBaseRequest(baseRequest);
    setSubmittedReform(reform);
    setTriggered(true);
    resetHouseholdImpact();
    if (!skipHousehold) {
      runHouseholdImpact(baseRequest, reform);
    }
    resetStateImpact();
    runStateImpact(reform);
  };

  // Live "preview" reform derived from current wizard config — updates the
  // sidebar number summary and the rate matrix preview without actually
  // firing a multi-year run on every step.
  const livePreviewRates = useMemo(
    () => configToCustomRates(path, config),
    [path, config],
  );

  const summary = summarizeScenario(path, config);

  return (
    <div className="space-y-6">
      {/* G1 — sticky scenario summary chip row above both columns. */}
      {summary && (
        <div className="sticky top-0 z-10 -mx-6 px-6 py-3 bg-white/95 backdrop-blur border-b border-gray-200 flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
            Scenario
          </span>
          <span className="rounded-full bg-primary-50 border border-primary-200 px-3 py-1 text-xs font-medium text-primary-700">
            {summary}
          </span>
          {triggered && (
            <span className="text-xs text-gray-500">
              Household: ${household.income.toLocaleString('en-US')}, age{' '}
              {household.age}, {household.married ? 'married' : 'single'},{' '}
              {household.dependents.length}{' '}
              {household.dependents.length === 1 ? 'dependent' : 'dependents'}
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        {/* Left column: wizard */}
        <div className="min-w-0">
          <Wizard
            path={path}
            onPathChange={setPath}
            config={config}
            onConfigChange={setConfig}
            household={household}
            onHouseholdChange={setHousehold}
            onShowResults={() => setShowResults(true)}
            onDone={handleDone}
            onSkipHousehold={() => setSkipHousehold(true)}
          />

          {/* Custom matrix only surfaces when the user picks the custom
              path — kept full-width below the wizard so users can see the
              entire 9 × 7 grid. */}
          {path === 'custom' && (
            <div className="mt-6">
              <RateMatrixBuilder
                customRates={config.customRates}
                onChange={(cr) => setConfig({ ...config, customRates: cr })}
              />
            </div>
          )}
        </div>

        {/* Right column: live rate-line preview */}
        <aside className="min-w-0">
          {!showResults ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
              <p className="font-medium text-gray-700">
                Pick a starting point on the left
              </p>
              <p className="mt-2">
                Once you choose a reform path, this panel will preview the
                year-by-year rates. Click Done at the end of the wizard to
                run the full statewide and household impact calculations.
              </p>
            </div>
          ) : (
            <RateLineChart rates={livePreviewRates} />
          )}
        </aside>
      </div>

      {/* Full-width impacts section, only after the user clicks Done. */}
      {triggered && (
        <div className="space-y-6 pt-4">
          {!skipHousehold && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-xs text-gray-600">
              <span>Chart x-axis max:</span>
              {[200000, 500000, 1000000].map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    setMaxEarnings(v);
                    const next = submittedBaseRequest
                      ? { ...submittedBaseRequest, max_earnings: v }
                      : null;
                    setSubmittedBaseRequest(next);
                    if (next) {
                      runYearHousehold(
                        selectedYear,
                        next,
                        submittedReform ?? {},
                      );
                    }
                  }}
                  className={`px-3 py-1 rounded-full font-medium transition-colors ${
                    maxEarnings === v
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  ${v >= 1000000 ? `${v / 1000000}M` : `${v / 1000}k`}
                </button>
              ))}
            </div>
          )}

          {/* Household impact (fast) */}
          {!skipHousehold && submittedBaseRequest && (
            <ImpactAnalysis
              years={householdYears}
              baseRequest={submittedBaseRequest}
              maxEarnings={maxEarnings}
              selectedYear={selectedYear}
              onYearChange={setSelectedYear}
            />
          )}

          {/* State 10-year impact (slow) */}
          <StateImpact years={stateYears} running={stateRunning} />
        </div>
      )}
    </div>
  );
}

