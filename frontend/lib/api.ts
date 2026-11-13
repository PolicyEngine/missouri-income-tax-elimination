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
  DEFAULT_BASE_URL,
  EconomyComparisonTimeoutError,
  PolicyEngineApiError,
  RATE_LIMIT_WAIT_MILLISECONDS,
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

/**
 * What the page says about the firewall's limit, which everyone behind one
 * address shares.
 */
export const SHARED_LIMIT_EXPLANATION =
  'Everyone on your network, such as a workshop or an office, shares a ' +
  'limit on calculations a minute';

const RATE_LIMIT_REFUSAL_MESSAGE = `${SHARED_LIMIT_EXPLANATION}, and it has been reached.`;

/**
 * Whether the page is served from the dashboard API's own origin
 * (www.policyengine.org), where the firewall's 429 is readable.
 */
function pageSharesDashboardApiOrigin(): boolean {
  return globalThis.location?.origin === new URL(DEFAULT_BASE_URL).origin;
}

/**
 * Household calculation failures that are worth one more try, following
 * the policyengine-api-access skill's errors table: a 502 from the
 * dashboard API, or a 503 from the Public API ("Authentication is
 * unavailable"). A 503 from the dashboard API itself (its settings missing)
 * fails the same way on that one retry and is then shown. A 504 is not
 * retried: the dashboard API has already waited 750 seconds for the
 * household, so the page shows the failure.
 */
const HOUSEHOLD_RETRYABLE_STATUSES = new Set([502, 503]);

/** Each household calculation is sent at most this many times in all. */
const MAXIMUM_HOUSEHOLD_ATTEMPTS = 2;

/**
 * The retry waits 2 seconds, or longer when the failure's Retry-After asks
 * for longer. A failure that asks for more than a minute is shown instead.
 */
const RETRY_WAIT_MILLISECONDS = 2_000;
const LONGEST_RETRY_WAIT_MILLISECONDS = 60_000;

/**
 * How long to wait before sending a failed household calculation again, or
 * null when it is not sent again.
 */
function householdRetryWaitMilliseconds(
  error: unknown,
  attempt: number,
): number | null {
  if (
    !(error instanceof PolicyEngineApiError) ||
    error.status === null ||
    !HOUSEHOLD_RETRYABLE_STATUSES.has(error.status) ||
    attempt >= MAXIMUM_HOUSEHOLD_ATTEMPTS
  ) {
    return null;
  }
  const wait = Math.max(
    RETRY_WAIT_MILLISECONDS,
    (error.retryAfterSeconds ?? 0) * 1000,
  );
  return wait > LONGEST_RETRY_WAIT_MILLISECONDS ? null : wait;
}

/**
 * Household calculations, retries included, start at most 15 times in any
 * minute: half of the dashboard API's limit of 30 a minute for one address,
 * as the policyengine-api-access skill asks. One "Done" needs up to 18.
 */
export const householdCalculationLimit = createCallLimiter(15, 60_000);

/**
 * When the page may send household calculations again after a refusal for
 * the firewall's limit, in `Date.now()` milliseconds. Every household
 * calculation checks it when it is sent, whichever run asks for it.
 */
let householdCalculationsPausedUntil = 0;
const pauseListeners = new Set<() => void>();

/**
 * Stops the page from sending household calculations for `milliseconds`
 * (a minute unless given); 0 ends a pause.
 */
export function pauseHouseholdCalculations(
  milliseconds: number = RATE_LIMIT_WAIT_MILLISECONDS,
): void {
  householdCalculationsPausedUntil = Date.now() + milliseconds;
  pauseListeners.forEach((listener) => listener());
}

/** Milliseconds until the page may send household calculations again; 0 when it may now. */
export function householdCalculationPauseRemaining(): number {
  return Math.max(0, householdCalculationsPausedUntil - Date.now());
}

/** Calls `listener` whenever a pause starts or is ended early; returns the unsubscribe. */
export function onHouseholdCalculationPause(listener: () => void): () => void {
  pauseListeners.add(listener);
  return () => {
    pauseListeners.delete(listener);
  };
}

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
 * The refusal for a calculation the page holds back during a pause. It was
 * never sent, so it has no HTTP status.
 */
function pausedCalculationFailure(): DashboardApiFailure {
  // The pause may have started from a request with no answer, which only
  // may have met the limit.
  return new DashboardApiFailure(
    `${SHARED_LIMIT_EXPLANATION}, which may have been reached.`,
    null,
    true,
  );
}

/**
 * Turns a failure of the dashboard API client into a message for the user.
 * `action` completes "PolicyEngine could not …".
 */
function failureFor(
  error: PolicyEngineApiError,
  action: string,
  /**
   * Whether the page counts down to its next household calculation; the
   * statewide results have no countdown, so their refusals say when to
   * try again.
   */
  countdownShown = false,
): DashboardApiFailure {
  const whenToTryAgain = countdownShown ? '' : ' Try again in a minute.';
  if (error.status === null) {
    if (pageSharesDashboardApiOrigin()) {
      // The firewall's 429 would be readable here, so this is a network
      // failure.
      return new DashboardApiFailure(
        "PolicyEngine's calculation service could not be reached. Check " +
          'your connection and try again.',
        null,
      );
    }
    // On another origin, such as the dashboard's own host, the firewall's
    // 429 has no CORS headers, so the browser reports a network failure.
    // So does the dashboard API's 403 for an origin it does not allow.
    return new DashboardApiFailure(
      "PolicyEngine's calculation service could not be reached. " +
        `${SHARED_LIMIT_EXPLANATION}, which may have been reached.` +
        whenToTryAgain,
      null,
      true,
    );
  }
  if (error.status === 429) {
    return new DashboardApiFailure(
      RATE_LIMIT_REFUSAL_MESSAGE + whenToTryAgain,
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

/**
 * Sends one household calculation. The five minutes count from when it is
 * sent, after any wait for the 15-a-minute limit. Fails with the client's
 * error, so the caller can decide whether to send it again.
 */
async function sendHouseholdCalculation(
  household: Record<string, unknown>,
  policy: Record<string, unknown> | undefined,
  signal: AbortSignal | undefined,
): Promise<CalculatedHousehold> {
  if (householdCalculationPauseRemaining() > 0) {
    throw pausedCalculationFailure();
  }
  await householdCalculationLimit.acquire(signal);
  // The pause may have started while this call waited for the limit.
  if (householdCalculationPauseRemaining() > 0) {
    throw pausedCalculationFailure();
  }
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
  try {
    return await policyengine.calculateHousehold<CalculatedHousehold>(
      { country: 'us', household, policy },
      { signal: controller.signal },
    );
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
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCancel);
  }
}

async function calculateHousehold(
  household: Record<string, unknown>,
  policy: Record<string, unknown> | undefined,
  signal: AbortSignal | undefined,
): Promise<CalculatedHousehold> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await sendHouseholdCalculation(household, policy, signal);
    } catch (error) {
      const retryWait = householdRetryWaitMilliseconds(error, attempt);
      if (retryWait === null) {
        if (error instanceof PolicyEngineApiError) {
          const failure = failureFor(error, 'calculate this household', true);
          if (failure.rateLimited) {
            // Pause at once, even if the caller has already failed for
            // another reason and never sees this refusal.
            pauseHouseholdCalculations();
          }
          throw failure;
        }
        throw error;
      }
      // After this wait, the retry also waits for the 15-a-minute limit
      // and checks the pause, like any calculation.
      await waitFor(retryWait, signal);
    }
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
