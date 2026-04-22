/**
 * Build a PolicyEngine reform dict for the Missouri income-tax-elimination
 * scenarios.
 *
 * Missouri's 2025 income tax has 8 brackets indexed 0–7 with rates:
 *   [0, 0.02, 0.025, 0.03, 0.035, 0.04, 0.045, 0.047]
 *
 * Uses the verified `gov.states.mo.tax.income.rates[N].rate` syntax (and
 * `rates[N].threshold` for threshold edits). This path format was verified
 * during the South Carolina dashboard work (commit b0d1905) — the
 * PolicyEngine API's `Reform.from_dict` resolver supports `name[N]` syntax
 * where `name` is a ParameterScale.
 */

export type ReformType =
  | 'proportional'
  | 'top_cap'
  | 'eliminate_top'
  | 'full_eliminate'
  | 'custom';

/** Missouri's 2025 tax bracket rates (indices 0–7). */
export const MO_2025_RATES: number[] = [
  0, 0.02, 0.025, 0.03, 0.035, 0.04, 0.045, 0.047,
];

/** Years covered by per-year reform customization (2026 baseline; 2027–2035 adjustable). */
export const REFORM_YEARS: number[] = [
  2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035,
];

/** Final open-ended end date — the last year's value persists forever. */
const FINAL_END = '2100-12-31';

/**
 * Build a reform dict for the PolicyEngine API based on the selected reform
 * type and per-year params.
 *
 * Parameter interpretation by reform type:
 *   - proportional:    `yearParams[Y]` is the fractional cut in [0, 1] for
 *                      year Y (e.g. 1.0 = fully eliminate; 0.5 = halve rates).
 *                      Each non-zero year gets its own period; the final year
 *                      in REFORM_YEARS has its end date extended to 2100.
 *   - top_cap:         `yearParams[Y]` is the top-rate cap in [0, 0.047] for
 *                      year Y. Every bracket whose 2025 rate exceeds the cap
 *                      is reduced to the cap in that year.
 *   - eliminate_top:   yearParams ignored. Uses `startYear` (default 2027) for
 *                      the period start. Sets rates[7].threshold to 999999999.
 *   - full_eliminate:  yearParams ignored. Uses `startYear` (default 2027) for
 *                      the period start. Sets every non-zero bracket rate to 0.
 *   - custom:          `customRates[Y]` is an 8-element array of bracket rates
 *                      for year Y (2027–2035). Only emits periods for cells
 *                      that differ from MO_2025_RATES.
 *
 * If no changes apply (all yearParams are 0 / no brackets affected), returns
 * an empty reform dict `{}`.
 */
export function buildReform(
  type: ReformType,
  yearParams: Record<number, number>,
  startYear = 2027,
  customRates?: Record<number, number[]>,
): Record<string, Record<string, number | boolean>> {
  const reform: Record<string, Record<string, number | boolean>> = {};

  if (type === 'proportional') {
    for (let i = 1; i < MO_2025_RATES.length; i++) {
      const periods: Record<string, number> = {};
      for (let idx = 0; idx < REFORM_YEARS.length; idx++) {
        const year = REFORM_YEARS[idx];
        const cut = yearParams[year] ?? 0;
        if (cut === 0) continue; // Skip baseline years.
        const newRate = MO_2025_RATES[i] * (1 - cut);
        const isLast = idx === REFORM_YEARS.length - 1;
        const end = isLast ? FINAL_END : `${year}-12-31`;
        periods[`${year}-01-01.${end}`] = newRate;
      }
      if (Object.keys(periods).length > 0) {
        reform[`gov.states.mo.tax.income.rates[${i}].rate`] = periods;
      }
    }
    return reform;
  }

  if (type === 'top_cap') {
    // For each bracket, for each year whose cap is below the 2025 rate,
    // add a period reducing that bracket's rate to the cap for that year.
    for (let i = 1; i < MO_2025_RATES.length; i++) {
      const periods: Record<string, number> = {};
      for (let idx = 0; idx < REFORM_YEARS.length; idx++) {
        const year = REFORM_YEARS[idx];
        const cap = yearParams[year];
        // Treat undefined / NaN as baseline (no cap applied).
        if (cap === undefined || cap === null || isNaN(cap)) continue;
        // Cap at or above the 2025 rate means no change for this bracket.
        if (cap >= MO_2025_RATES[i]) continue;
        const isLast = idx === REFORM_YEARS.length - 1;
        const end = isLast ? FINAL_END : `${year}-12-31`;
        periods[`${year}-01-01.${end}`] = cap;
      }
      if (Object.keys(periods).length > 0) {
        reform[`gov.states.mo.tax.income.rates[${i}].rate`] = periods;
      }
    }
    return reform;
  }

  if (type === 'eliminate_top') {
    // Push the top bracket's threshold to "infinity" starting in startYear.
    const period = `${startYear}-01-01.${FINAL_END}`;
    reform['gov.states.mo.tax.income.rates[7].threshold'] = {
      [period]: 999999999,
    };
    return reform;
  }

  if (type === 'full_eliminate') {
    // Zero every non-zero bracket rate starting in startYear.
    const period = `${startYear}-01-01.${FINAL_END}`;
    for (let i = 1; i < MO_2025_RATES.length; i++) {
      reform[`gov.states.mo.tax.income.rates[${i}].rate`] = {
        [period]: 0,
      };
    }
    return reform;
  }

  if (type === 'custom') {
    return buildCustomReform(customRates ?? {});
  }

  return reform;
}

/**
 * Build a reform dict from a year × bracket matrix of custom rates.
 *
 * `customRates[year]` should be an array of 8 bracket rates (decimal form)
 * for each year 2027–2035. Only emits a period for (bracket, year) cells
 * where the rate differs from the 2025 baseline. Returns {} if nothing
 * differs.
 */
export function buildCustomReform(
  customRates: Record<number, number[]>,
): Record<string, Record<string, number | boolean>> {
  const reform: Record<string, Record<string, number | boolean>> = {};

  for (let i = 0; i < MO_2025_RATES.length; i++) {
    const periods: Record<string, number> = {};
    for (let idx = 0; idx < REFORM_YEARS.length; idx++) {
      const year = REFORM_YEARS[idx];
      const row = customRates[year];
      if (!row || row.length <= i) continue;
      const rate = row[i];
      if (rate === undefined || rate === null || isNaN(rate)) continue;
      // Skip cells that equal the 2025 baseline.
      if (rate === MO_2025_RATES[i]) continue;
      const isLast = idx === REFORM_YEARS.length - 1;
      const end = isLast ? FINAL_END : `${year}-12-31`;
      periods[`${year}-01-01.${end}`] = rate;
    }
    if (Object.keys(periods).length > 0) {
      reform[`gov.states.mo.tax.income.rates[${i}].rate`] = periods;
    }
  }

  return reform;
}

/**
 * Produce a linear ramp of per-year params over REFORM_YEARS.
 *
 * The first year (2027) gets `startValue`, the final year (2035) gets
 * `endValue`, and intermediate years are linearly interpolated.
 */
export function linearRamp(
  startValue: number,
  endValue: number,
): Record<number, number> {
  const n = REFORM_YEARS.length;
  const out: Record<number, number> = {};
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 1 : i / (n - 1);
    out[REFORM_YEARS[i]] = startValue + (endValue - startValue) * t;
  }
  return out;
}

/** Produce a year-params record where every year has the same value. */
export function constantRamp(value: number): Record<number, number> {
  const out: Record<number, number> = {};
  for (const y of REFORM_YEARS) out[y] = value;
  return out;
}

/**
 * Produce a 9 × 8 matrix (year × bracket) initialised to the 2025 baseline
 * rates. Used as the default state for the custom reform builder.
 */
export function defaultCustomRates(): Record<number, number[]> {
  const out: Record<number, number[]> = {};
  for (const y of REFORM_YEARS) out[y] = [...MO_2025_RATES];
  return out;
}
