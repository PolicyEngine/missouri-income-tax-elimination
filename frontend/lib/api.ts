/**
 * PolicyEngine calculations for the Missouri Income Tax Elimination
 * dashboard, through www.policyengine.org's dashboard API.
 *
 * The page never calls the PolicyEngine Public API itself: the dashboard
 * API's server adds PolicyEngine's credential and forwards household
 * calculations, stored policies and economy comparisons to the Public API.
 *
 * Unlike the Utah/SC dashboards, reforms here are user-supplied. The API
 * client accepts an explicit `reform` dict. The household impact is computed
 * as (reform) minus (baseline current law), so positive numbers mean the
 * household gains under the reform.
 */

import {
  createPolicyEngineApiClient,
  EconomyComparisonTimeoutError,
  PolicyEngineApiError,
} from '@policyengine/api-client';

import type {
  HouseholdRequest,
  HouseholdImpactResponse,
  EconomyImpactResult,
} from './types';
import { buildHouseholdSituation, interpolate } from './household';

const policyengine = createPolicyEngineApiClient();

/** PolicyEngine's baseline policy id for current law (US). */
export const BASELINE_POLICY_ID = 2;

/** How long a household calculation may take before the page gives up on it. */
const CALCULATION_TIMEOUT_MILLISECONDS = 300_000;

/**
 * Brief gateway failures. The dashboard API answers 504 when the Public API
 * takes over 100 seconds; the Public API still finishes and caches the
 * result, so the one retry usually gets it at once.
 */
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

/** How long to wait before the one retry of a gateway failure. */
const GATEWAY_RETRY_WAIT_MILLISECONDS = 2_000;

function waitFor(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** A dashboard API request failed; `message` is written for the user. */
export class DashboardApiFailure extends Error {
  override name = 'DashboardApiFailure';

  constructor(
    message: string,
    /** The dashboard API's HTTP status, or null when no answer was read. */
    readonly status: number | null,
  ) {
    super(message);
  }
}

function dashboardApiMessage(body: unknown): string | null {
  if (typeof body === 'object' && body !== null) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }
  return null;
}

/**
 * Turns a failure of the dashboard API client into a message for the user.
 * `action` completes "PolicyEngine could not …".
 */
function failureFor(
  error: PolicyEngineApiError,
  action: string,
): DashboardApiFailure {
  if (error.status === null) {
    // On another origin, such as the dashboard's own host, the firewall's
    // 429 has no CORS headers, so the browser reports a network failure.
    // So does the dashboard API's 403 for an origin it does not allow.
    return new DashboardApiFailure(
      "PolicyEngine's calculation service could not be reached. If many " +
        'calculations have been run from your network in the last minute, ' +
        'wait a minute and try again.',
      null,
    );
  }
  if (error.status === 429) {
    return new DashboardApiFailure(
      'Too many calculations have been run from your network in the last ' +
        'minute. Wait a minute and try again.',
      429,
    );
  }
  const detail = dashboardApiMessage(error.body) ?? 'Try again in a few minutes.';
  return new DashboardApiFailure(
    `PolicyEngine could not ${action} (HTTP ${error.status}): ${detail}`,
    error.status,
  );
}

/** Values over the income axis, keyed by year. */
type ValuesByYear = Record<string, number[]>;

/** The parts of a calculated household this page reads. */
interface CalculatedHousehold {
  people: Record<string, Record<string, ValuesByYear>>;
  households: Record<string, Record<string, ValuesByYear>>;
  tax_units: Record<string, Record<string, ValuesByYear>>;
}

async function calculateHousehold(
  household: Record<string, unknown>,
  policy?: Record<string, unknown>,
): Promise<CalculatedHousehold> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    CALCULATION_TIMEOUT_MILLISECONDS,
  );
  const calculate = () =>
    policyengine.calculateHousehold<CalculatedHousehold>(
      { country: 'us', household, policy },
      { signal: controller.signal },
    );
  try {
    try {
      return await calculate();
    } catch (error) {
      // One retry of a brief gateway failure, within the same time limit.
      if (
        !(error instanceof PolicyEngineApiError) ||
        error.status === null ||
        !RETRYABLE_STATUSES.has(error.status)
      ) {
        throw error;
      }
      await waitFor(GATEWAY_RETRY_WAIT_MILLISECONDS, controller.signal);
      return await calculate();
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new DashboardApiFailure(
        'The calculation took longer than five minutes. Try again.',
        null,
      );
    }
    if (error instanceof PolicyEngineApiError) {
      throw failureFor(error, 'calculate this household');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  /**
   * Calculate household impact by running the baseline and reform household
   * simulations in parallel. Returns a `HouseholdImpactResponse` where
   * positive numbers mean the household nets more under the reform.
   */
  async calculateHouseholdImpact(
    request: HouseholdRequest,
    reform: Record<string, Record<string, number | boolean>> = {},
  ): Promise<HouseholdImpactResponse> {
    const household = buildHouseholdSituation(request);
    const yearStr = String(request.year);

    // Run baseline and reform in parallel.
    const hasReform = Object.keys(reform).length > 0;
    // Each resolves with the calculated household (the Public API's
    // `result`).
    const [baselineResult, reformResult] = await Promise.all([
      calculateHousehold(household),
      calculateHousehold(household, hasReform ? reform : undefined),
    ]);

    const baselineNetIncome: number[] =
      baselineResult.households['your household'][
        'household_net_income'
      ][yearStr];
    const reformNetIncome: number[] =
      reformResult.households['your household'][
        'household_net_income'
      ][yearStr];
    const incomeRange: number[] =
      baselineResult.people['you']['employment_income'][yearStr];

    const baselineStateTax: number[] =
      baselineResult.tax_units['your tax unit']['mo_income_tax'][
        yearStr
      ];
    const reformStateTax: number[] =
      reformResult.tax_units['your tax unit']['mo_income_tax'][
        yearStr
      ];

    const baselineFederalTax: number[] =
      baselineResult.tax_units['your tax unit']['income_tax'][yearStr];
    const reformFederalTax: number[] =
      reformResult.tax_units['your tax unit']['income_tax'][yearStr];

    // Impact = reform - baseline (conventional direction).
    const netIncomeChange = reformNetIncome.map(
      (val, i) => val - baselineNetIncome[i]
    );
    const federalTaxChange = reformFederalTax.map(
      (val, i) => val - baselineFederalTax[i]
    );
    const stateTaxChange = reformStateTax.map(
      (val, i) => val - baselineStateTax[i]
    );

    const baselineAtIncome = interpolate(
      incomeRange,
      baselineNetIncome,
      request.income
    );
    const reformAtIncome = interpolate(
      incomeRange,
      reformNetIncome,
      request.income
    );
    const baselineFederalTaxAtIncome = interpolate(
      incomeRange,
      baselineFederalTax,
      request.income
    );
    const reformFederalTaxAtIncome = interpolate(
      incomeRange,
      reformFederalTax,
      request.income
    );
    const baselineStateTaxAtIncome = interpolate(
      incomeRange,
      baselineStateTax,
      request.income
    );
    const reformStateTaxAtIncome = interpolate(
      incomeRange,
      reformStateTax,
      request.income
    );

    const federalTaxChangeAtIncome =
      reformFederalTaxAtIncome - baselineFederalTaxAtIncome;
    const stateTaxChangeAtIncome =
      reformStateTaxAtIncome - baselineStateTaxAtIncome;
    const netIncomeChangeAtIncome = reformAtIncome - baselineAtIncome;

    return {
      income_range: incomeRange,
      net_income_change: netIncomeChange,
      federalTaxChange,
      stateTaxChange,
      netIncomeChange,
      benefit_at_income: {
        baseline: baselineAtIncome,
        reform: reformAtIncome,
        difference: netIncomeChangeAtIncome,
        federal_tax_change: federalTaxChangeAtIncome,
        state_tax_change: stateTaxChangeAtIncome,
        net_income_change: netIncomeChangeAtIncome,
      },
      x_axis_max: request.max_earnings,
    };
  },
};


/**
 * Store a reform as a PolicyEngine policy. Returns its numeric ID, usable
 * in economy comparisons.
 */
export async function createPolicy(
  policy: Record<string, Record<string, number | boolean>>,
): Promise<number> {
  try {
    return await policyengine.createPolicy({ country: 'us', parameters: policy });
  } catch (error) {
    if (error instanceof PolicyEngineApiError) {
      throw failureFor(error, 'store this reform');
    }
    throw error;
  }
}

/**
 * Poll the statewide (Missouri) comparison of a policy with the baseline for
 * one year until it is ready. Calls `onUpdate` with each intermediate status
 * ("computing"). Respects `abortSignal` for cancellation. The client reads
 * every 5 seconds, waits out a rate-limited read the page can see, and gives
 * up after 30 minutes.
 */
export async function pollEconomicImpact(
  policyId: number,
  year: number,
  onUpdate?: (status: string) => void,
  abortSignal?: AbortSignal,
  baselinePolicyId: number = BASELINE_POLICY_ID,
): Promise<EconomyImpactResult> {
  let result: EconomyImpactResult | null;
  try {
    result = await policyengine.compareEconomy<EconomyImpactResult>(
      {
        country: 'us',
        policy: policyId,
        baseline: baselinePolicyId,
        region: 'mo',
        year,
      },
      {
        signal: abortSignal,
        onProgress: onUpdate ? (answer) => onUpdate(answer.status) : undefined,
      },
    );
  } catch (error) {
    if (abortSignal?.aborted) {
      throw new Error('Aborted');
    }
    if (error instanceof EconomyComparisonTimeoutError) {
      throw new DashboardApiFailure(
        `The statewide calculation for ${year} did not finish within 30 ` +
          'minutes. Try again later.',
        null,
      );
    }
    if (error instanceof PolicyEngineApiError) {
      throw failureFor(error, `compare the economy for ${year}`);
    }
    throw error;
  }
  if (!result) {
    throw new Error('API returned ok status but no result');
  }
  return result;
}
