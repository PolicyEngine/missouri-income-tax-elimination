'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ImpactAnalysis from '@/components/ImpactAnalysis';
import PolicyOverview from '@/components/PolicyOverview';
import ReformBuilder from '@/components/ReformBuilder';
import StateImpact from '@/components/StateImpact';
import { useStateImpact } from '@/hooks/useStateImpact';
import type { HouseholdRequest } from '@/lib/types';
import { parseHashParams } from '@/lib/embedding';
import { buildReform, type ReformType } from '@/lib/reform';

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
        <div className="max-w-5xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">
            Missouri Income Tax Elimination Calculator
          </h1>
          <p className="text-lg opacity-90">
            Explore paths to eliminating Missouri&apos;s individual income tax
            &mdash; customize a scenario and see household and state impacts
            over 10 years.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
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

/** Combined Reform + Household Impact tab. */
function ReformImpactTab() {
  // Initial household values, optionally hydrated from URL hash.
  const getInitialValues = () => {
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
  };

  const initial = getInitialValues();

  const [ageHead, setAgeHead] = useState(initial.age);
  const [ageHeadRaw, setAgeHeadRaw] = useState(String(initial.age));
  const [ageSpouse, setAgeSpouse] = useState<number | null>(
    initial.married ? 35 : null,
  );
  const [ageSpouseRaw, setAgeSpouseRaw] = useState('35');
  const [married, setMarried] = useState(initial.married);
  const [dependentAges, setDependentAges] = useState<number[]>(initial.dependents);
  const [income, setIncome] = useState(initial.income);
  const [maxEarnings, setMaxEarnings] = useState(100000);

  // Reform builder state.
  const [reformType, setReformType] = useState<ReformType>('proportional');
  const [reformParam, setReformParam] = useState(0.5);

  // Submission state.
  const [triggered, setTriggered] = useState(false);
  const [submittedRequest, setSubmittedRequest] = useState<HouseholdRequest | null>(null);
  const [submittedReform, setSubmittedReform] = useState<Record<
    string,
    Record<string, number | boolean>
  > | null>(null);

  // 10-year state impact orchestration.
  const {
    years: stateYears,
    running: stateRunning,
    run: runStateImpact,
    reset: resetStateImpact,
  } = useStateImpact();

  // Keep form in sync with hash changes.
  useEffect(() => {
    const handleHashChange = () => {
      const params = parseHashParams(window.location.hash);
      if (params.income !== undefined) setIncome(params.income);
      if (params.age !== undefined) {
        setAgeHead(params.age);
        setAgeHeadRaw(String(params.age));
      }
      if (params.married !== undefined) {
        setMarried(params.married);
        if (params.married) {
          setAgeSpouse(35);
          setAgeSpouseRaw('35');
        } else {
          setAgeSpouse(null);
        }
      }
      if (params.dependents) setDependentAges(params.dependents);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleMarriedChange = (value: boolean) => {
    setMarried(value);
    if (!value) {
      setAgeSpouse(null);
    } else {
      setAgeSpouse(35);
      setAgeSpouseRaw('35');
    }
  };

  const handleDependentCountChange = (count: number) => {
    const ages = [...dependentAges];
    while (ages.length < count) ages.push(5);
    ages.splice(count);
    setDependentAges(ages);
  };

  const formatNumber = (num: number) => num.toLocaleString('en-US');
  const parseNumber = (str: string) => {
    const num = Number(str.replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
  };

  const currentReform = useMemo(
    () => buildReform(reformType, reformParam),
    [reformType, reformParam],
  );

  const buildRequest = (): HouseholdRequest => ({
    age_head: ageHead,
    age_spouse: married ? ageSpouse : null,
    dependent_ages: dependentAges,
    income,
    year: 2026,
    max_earnings: maxEarnings,
    state_code: 'MO',
  });

  const handleCalculate = () => {
    const request = buildRequest();
    const reform = buildReform(reformType, reformParam);
    setSubmittedRequest(request);
    setSubmittedReform(reform);
    setTriggered(true);
    // Kick off the 10-year state impact run.
    resetStateImpact();
    runStateImpact(reform);
  };

  const handleReformChange = (type: ReformType, param: number) => {
    setReformType(type);
    setReformParam(param);
  };

  return (
    <div className="space-y-6">
      {/* Input layout: household left, reform right on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Household form */}
        <section className="bg-gray-50 rounded-xl p-6 md:p-8 border border-gray-200 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Your household</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            {/* Employment income */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-600 mb-1.5">
                Employment income
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                  $
                </span>
                <input
                  type="text"
                  value={formatNumber(income)}
                  onChange={(e) => setIncome(parseNumber(e.target.value))}
                  className="w-full pl-6 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                />
              </div>
            </div>

            {/* Age */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">
                Your age
              </label>
              <input
                type="number"
                value={ageHeadRaw}
                onChange={(e) => setAgeHeadRaw(e.target.value)}
                onBlur={() => {
                  const clamped = Math.max(
                    18,
                    Math.min(100, parseInt(ageHeadRaw) || 18),
                  );
                  setAgeHead(clamped);
                  setAgeHeadRaw(String(clamped));
                }}
                min={18}
                max={100}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              />
            </div>

            {/* Filing status + spouse age */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1.5">
                Filing status
              </label>
              <label
                htmlFor="married"
                className="flex items-center gap-3 w-full px-3 py-2 bg-white border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <input
                  type="checkbox"
                  id="married"
                  checked={married}
                  onChange={(e) => handleMarriedChange(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">
                  Married filing jointly
                </span>
              </label>
              {married && (
                <input
                  type="number"
                  value={ageSpouseRaw}
                  onChange={(e) => setAgeSpouseRaw(e.target.value)}
                  onBlur={() => {
                    const clamped = Math.max(
                      18,
                      Math.min(100, parseInt(ageSpouseRaw) || 18),
                    );
                    setAgeSpouse(clamped);
                    setAgeSpouseRaw(String(clamped));
                  }}
                  min={18}
                  max={100}
                  placeholder="Spouse age"
                  aria-label="Spouse age"
                  className="w-full mt-2 px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                />
              )}
            </div>

            {/* Dependents */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-600 mb-1.5">
                Dependents
              </label>
              <input
                type="number"
                value={dependentAges.length}
                onChange={(e) =>
                  handleDependentCountChange(
                    Math.max(0, Math.min(10, parseInt(e.target.value) || 0)),
                  )
                }
                min={0}
                max={10}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
              />
              {dependentAges.length > 0 && (
                <div className="mt-2">
                  <span className="block text-xs font-medium text-gray-500 mb-1">
                    Age(s) &mdash; children under 6 qualify for the federal CTC
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {dependentAges.map((age, i) => (
                      <input
                        key={i}
                        type="number"
                        value={age}
                        onChange={(e) => {
                          const newAges = [...dependentAges];
                          newAges[i] = Math.max(
                            0,
                            Math.min(26, parseInt(e.target.value) || 0),
                          );
                          setDependentAges(newAges);
                        }}
                        min={0}
                        max={26}
                        className="px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                        placeholder={`Age ${i + 1}`}
                        aria-label={`Dependent ${i + 1} age`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Reform builder */}
        <ReformBuilder
          type={reformType}
          param={reformParam}
          onChange={handleReformChange}
        />
      </div>

      {/* Calculate button */}
      <div>
        <button
          onClick={handleCalculate}
          disabled={stateRunning}
          className="py-3 px-10 rounded-lg font-semibold text-white bg-primary-500 hover:bg-primary-600 active:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md sm:w-auto w-full"
        >
          {stateRunning ? 'Calculating…' : 'Calculate impact'}
        </button>
      </div>

      {/* Chart x-axis options */}
      {triggered && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <span>Chart x-axis max:</span>
          {[100000, 200000, 500000, 1000000].map((v) => (
            <button
              key={v}
              onClick={() => {
                setMaxEarnings(v);
                setSubmittedRequest((prev) =>
                  prev ? { ...prev, max_earnings: v } : null,
                );
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
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
      {submittedRequest && (
        <ImpactAnalysis
          request={submittedRequest}
          triggered={triggered}
          maxEarnings={maxEarnings}
          reform={submittedReform ?? currentReform}
        />
      )}

      {/* State 10-year impact (slow) */}
      {triggered && (
        <StateImpact years={stateYears} running={stateRunning} />
      )}
    </div>
  );
}
