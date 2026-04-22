/**
 * PolicyEngine API client for the Missouri Income Tax Elimination dashboard.
 *
 * Unlike the Utah/SC dashboards, reforms here are user-supplied. The API
 * client accepts an explicit `reform` dict. The household impact is computed
 * as (reform) minus (baseline current law), so positive numbers mean the
 * household gains under the reform.
 */

import type {
  HouseholdRequest,
  HouseholdImpactResponse,
  EconomyImpactResult,
} from './types';
import { buildHouseholdSituation, interpolate } from './household';

const PE_API_URL = 'https://api.policyengine.org';

/** PolicyEngine's baseline policy id for current law (US). */
export const BASELINE_POLICY_ID = 2;

class ApiError extends Error {
  status: number;
  response: unknown;
  constructor(message: string, status: number, response?: unknown) {
    super(message);
    this.status = status;
    this.response = response;
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout = 120000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    // If caller passed an abortSignal, merge with our timeout controller.
    return await fetch(url, {
      ...options,
      signal: options.signal ?? controller.signal,
    });
  } finally {
    clearTimeout(id);
  }
}

interface PEApiCalculateResponse {
  result: {
    households: Record<string, Record<string, Record<string, number[]>>>;
    people: Record<string, Record<string, Record<string, number[]>>>;
    tax_units: Record<string, Record<string, Record<string, number[]>>>;
  };
}

async function peCalculate(
  body: Record<string, unknown>
): Promise<PEApiCalculateResponse> {
  const response = await fetchWithTimeout(
    `${PE_API_URL}/us/calculate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!response.ok) {
    let errorBody;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }
    const errorMessage =
      typeof errorBody === 'object' && errorBody && 'message' in errorBody
        ? (errorBody as { message: string }).message
        : typeof errorBody === 'string'
          ? errorBody
          : JSON.stringify(errorBody);
    throw new ApiError(
      `PolicyEngine API error: ${response.status} - ${errorMessage}`,
      response.status,
      errorBody
    );
  }
  return response.json();
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
    const [baselineResult, reformResult] = await Promise.all([
      peCalculate({ household }),
      hasReform
        ? peCalculate({ household, policy: reform })
        : peCalculate({ household }),
    ]);

    const baselineNetIncome: number[] =
      baselineResult.result.households['your household'][
        'household_net_income'
      ][yearStr];
    const reformNetIncome: number[] =
      reformResult.result.households['your household'][
        'household_net_income'
      ][yearStr];
    const incomeRange: number[] =
      baselineResult.result.people['you']['employment_income'][yearStr];

    const baselineStateTax: number[] =
      baselineResult.result.tax_units['your tax unit']['mo_income_tax'][
        yearStr
      ];
    const reformStateTax: number[] =
      reformResult.result.tax_units['your tax unit']['mo_income_tax'][
        yearStr
      ];

    const baselineFederalTax: number[] =
      baselineResult.result.tax_units['your tax unit']['income_tax'][yearStr];
    const reformFederalTax: number[] =
      reformResult.result.tax_units['your tax unit']['income_tax'][yearStr];

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
        federal_eitc_change: 0,
        state_eitc_change: 0,
        federal_tax_change: federalTaxChangeAtIncome,
        state_tax_change: stateTaxChangeAtIncome,
        net_income_change: netIncomeChangeAtIncome,
      },
      x_axis_max: request.max_earnings,
    };
  },
};

/**
 * Create a PolicyEngine policy from a reform dict. Returns a numeric
 * `policy_id` usable with `/us/economy/...` endpoints.
 */
export async function createPolicy(
  policy: Record<string, Record<string, number | boolean>>,
): Promise<number> {
  const response = await fetchWithTimeout(
    `${PE_API_URL}/us/policy`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: policy }),
    }
  );
  if (!response.ok) {
    let errorBody;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }
    throw new ApiError(
      `PolicyEngine /us/policy error: ${response.status}`,
      response.status,
      errorBody,
    );
  }
  const body = await response.json();
  const policyId: number | undefined =
    body?.result?.policy_id ?? body?.policy_id;
  if (typeof policyId !== 'number') {
    throw new ApiError(
      `PolicyEngine /us/policy returned no policy_id: ${JSON.stringify(body)}`,
      500,
      body,
    );
  }
  return policyId;
}

export interface EconomicImpactResponse {
  status: 'ok' | 'computing' | 'error';
  result: EconomyImpactResult | null;
  message: string | null;
}

/**
 * Fetch the economic impact for the given policy and year, scoped to
 * Missouri. Returns the raw status / result / message triple from the
 * PolicyEngine API.
 */
export async function getEconomicImpact(
  policyId: number,
  year: number,
  baselinePolicyId: number = BASELINE_POLICY_ID,
  abortSignal?: AbortSignal,
): Promise<EconomicImpactResponse> {
  const url = `${PE_API_URL}/us/economy/${policyId}/over/${baselinePolicyId}?region=mo&time_period=${year}`;
  const response = await fetchWithTimeout(
    url,
    { method: 'GET', signal: abortSignal },
  );
  if (!response.ok) {
    let errorBody;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }
    const message =
      typeof errorBody === 'object' && errorBody && 'message' in errorBody
        ? (errorBody as { message: string }).message
        : typeof errorBody === 'string'
          ? errorBody
          : JSON.stringify(errorBody);
    return { status: 'error', result: null, message };
  }

  const body = await response.json();
  const status = (body?.status ?? 'error') as 'ok' | 'computing' | 'error';
  const result = (body?.result ?? null) as EconomyImpactResult | null;
  const message = (body?.message ?? null) as string | null;
  return { status, result, message };
}

/**
 * Poll `getEconomicImpact` until it returns `ok` or `error`. Calls
 * `onUpdate` with each intermediate status. Respects `abortSignal` for
 * cancellation.
 */
export async function pollEconomicImpact(
  policyId: number,
  year: number,
  onUpdate?: (status: string) => void,
  abortSignal?: AbortSignal,
  baselinePolicyId: number = BASELINE_POLICY_ID,
): Promise<EconomyImpactResult> {
  const pollIntervalMs = 5000;
  while (true) {
    if (abortSignal?.aborted) {
      throw new Error('Aborted');
    }
    const { status, result, message } = await getEconomicImpact(
      policyId,
      year,
      baselinePolicyId,
      abortSignal,
    );
    if (onUpdate) onUpdate(status);
    if (status === 'ok') {
      if (!result) {
        throw new Error('API returned ok status but no result');
      }
      return result;
    }
    if (status === 'error') {
      throw new Error(message || 'Economic impact calculation failed');
    }
    // status === 'computing' — wait and retry
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
        resolve();
      }, pollIntervalMs);
      const onAbort = () => {
        clearTimeout(timeout);
        reject(new Error('Aborted'));
      };
      if (abortSignal) abortSignal.addEventListener('abort', onAbort, { once: true });
    });
  }
}
