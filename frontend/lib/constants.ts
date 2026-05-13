/**
 * Shared constants for the Missouri income-tax-elimination dashboard.
 * Centralize anything that was previously duplicated across hooks or
 * inlined into page.tsx so a single edit reaches every consumer.
 */

/** Years the reform simulates across all impact charts. */
export const REFORM_YEARS = [
  2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035,
] as const;

/** Default household profile used when the URL hash doesn't override. */
export const HOUSEHOLD_DEFAULTS = {
  income: 50000,
  age: 35,
  married: false,
  dependents: [5] as number[],
};

/** Age used for the spouse when the household is married. The wizard
 * doesn't expose this — it's a fixed assumption for the household chart. */
export const SPOUSE_DEFAULT_AGE = 35;

/** X-axis upper bound for the household net-income chart. */
export const HOUSEHOLD_MAX_EARNINGS = 400000;

/** Initial year the household + statewide year-picker lands on. */
export const DEFAULT_SELECTED_YEAR = 2027;

/** Cap on parallel /us/economy and /us/calculate fetches. 4 keeps the
 * 9-year window to 2 batches when 2027 short-circuits as a baseline-
 * equal year (1 zero + 4 + 4). */
export const FETCH_CONCURRENCY = 4;
