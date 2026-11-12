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

import { createCallLimiter, waitFor } from './callLimiter';
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

/** Gateway failures that are worth trying again. */
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

/**
 * How long the page waits after a refusal for the firewall's limit before
 * it calculates households again: the firewall counts calculations a minute.
 */
export const RATE_LIMIT_PAUSE_MILLISECONDS = 60_000;

/**
 * What the page says about the firewall's limit, which everyone behind one
 * address shares.
 */
const SHARED_LIMIT_EXPLANATION =
  'Everyone on your network, such as a workshop or an office, shares a ' +
  'limit on calculations a minute';

/**
 * How many times to send a household calculation. A 504 means the
 * dashboard API gave up after 100 seconds while the Public API is still
 * calculating; the Public API stores the result when it finishes (Cloud Run
 * lets it run for 300 seconds), so the page asks again, 30 seconds after
 * each 504, until the stored result can be read or the five minutes are
 * up. A request that arrives while the first computation is still running
 * starts a second one, which is why the waits are not shorter. A 502 or 503
 * is brief and gets one retry after 2 seconds.
 */
const ATTEMPTS_AFTER_TIMEOUT = 3;
const ATTEMPTS_AFTER_GATEWAY_FAILURE = 2;
const RETRY_WAIT_MILLISECONDS_AFTER_TIMEOUT = 30_000;
const RETRY_WAIT_MILLISECONDS = 2_000;

/**
 * Household calculations, retries included, start at most 15 times in any
 * minute: half of the dashboard API's limit of 30 a minute for one address,
 * as the policyengine-api-access skill asks. One "Done" needs up to 18.
 */
export const householdCalculationLimit = createCallLimiter(15, 60_000);

/** A dashboard API request failed; `message` is written for the user. */
export class DashboardApiFailure extends Error {
  override name = 'DashboardApiFailure';

  constructor(
    message: string,
    /** The dashboard API's HTTP status, or null when no answer was read. */
    readonly status: number | null,
    /**
     * Whether the firewall's limit may have refused it: a 429, or no
     * readable answer, which is how a page on another origin sees a 429.
     */
    readonly rateLimited: boolean = false,
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
      "PolicyEngine's calculation service could not be reached. " +
        `${SHARED_LIMIT_EXPLANATION}: if it has been reached, this page can ` +
        'calculate again in a minute.',
      null,
      true,
    );
  }
  if (error.status === 429) {
    return new DashboardApiFailure(
      `${SHARED_LIMIT_EXPLANATION}, and it has been reached. This page can ` +
        'calculate again in a minute.',
      429,
      true,
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
  policy: Record<string, unknown> | undefined,
  signal: AbortSignal | undefined,
): Promise<CalculatedHousehold> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, CALCULATION_TIMEOUT_MILLISECONDS);
  // The page cancels a run when the user starts a new one.
  const onCancel = () => controller.abort(signal?.reason);
  if (signal?.aborted) {
    onCancel();
  } else {
    signal?.addEventListener('abort', onCancel, { once: true });
  }
  const calculate = async () => {
    await householdCalculationLimit.acquire(controller.signal);
    return policyengine.calculateHousehold<CalculatedHousehold>(
      { country: 'us', household, policy },
      { signal: controller.signal },
    );
  };
  try {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await calculate();
      } catch (error) {
        // Try again after a gateway failure, within the same time limit.
        if (
          !(error instanceof PolicyEngineApiError) ||
          error.status === null ||
          !RETRYABLE_STATUSES.has(error.status)
        ) {
          throw error;
        }
        const isTimeout = error.status === 504;
        const attempts = isTimeout
          ? ATTEMPTS_AFTER_TIMEOUT
          : ATTEMPTS_AFTER_GATEWAY_FAILURE;
        if (attempt >= attempts) {
          throw error;
        }
        await waitFor(
          isTimeout ? RETRY_WAIT_MILLISECONDS_AFTER_TIMEOUT : RETRY_WAIT_MILLISECONDS,
          controller.signal,
        );
      }
    }
  } catch (error) {
    if (timedOut) {
      throw new DashboardApiFailure(
        'The calculation took longer than five minutes. Try again.',
        null,
      );
    }
    if (signal?.aborted) {
      throw signal.reason;
    }
    if (error instanceof PolicyEngineApiError) {
      throw failureFor(error, 'calculate this household');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCancel);
  }
}

export const api = {
  /**
   * Calculate household impact by running the baseline and reform household
   * simulations in parallel. Returns a `HouseholdImpactResponse` where
   * positive numbers mean the household nets more under the reform.
   * Aborting `signal` cancels both calculations, and the promise rejects
   * with the signal's reason.
   */
  async calculateHouseholdImpact(
    request: HouseholdRequest,
    reform: Record<string, Record<string, number | boolean>> = {},
    signal?: AbortSignal,
  ): Promise<HouseholdImpactResponse> {
    const household = buildHouseholdSituation(request);
    const yearStr = String(request.year);

    // Run baseline and reform in parallel.
    const hasReform = Object.keys(reform).length > 0;
    // Each resolves with the calculated household (the Public API's
    // `result`).
    const [baselineResult, reformResult] = await Promise.all([
      calculateHousehold(household, undefined, signal),
      calculateHousehold(household, hasReform ? reform : undefined, signal),
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
