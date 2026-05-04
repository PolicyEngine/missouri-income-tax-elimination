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
 *   - proportional:    `yearParams[Y]` is a percentage-point reduction, stored
 *                      as a fraction (e.g. 0.015 = 1.5pp; 0.047 = subtract 4.7pp
 *                      which zeroes the top bracket and any below it).
 *                      ``new_rate = max(0, old_rate - yearParams[Y])`` is
 *                      applied to every non-zero MO bracket. Each non-zero year
 *                      gets its own period; the final year in REFORM_YEARS has
 *                      its end date extended to 2100.
 *   - top_cap:         `yearParams[Y]` is the top-rate cap in [0, 0.047] for
 *                      year Y. Every bracket whose 2025 rate exceeds the cap
 *                      is reduced to the cap in that year.
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
        const ppReduction = yearParams[year] ?? 0;
        if (ppReduction === 0) continue; // Skip baseline years.
        const newRate = Math.max(0, MO_2025_RATES[i] - ppReduction);
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

/**
 * Years in the rates matrix where every bracket equals MO_2025_RATES.
 * The multi-year hooks short-circuit these to a synthesized zero-impact
 * result instead of firing a sim that would inevitably return zero.
 *
 * Uses a small tolerance (1e-9) so floating-point noise from interpolation
 * doesn't accidentally classify a baseline year as "changed".
 */
export function unchangedYears(
  rates: Record<number, number[]>,
): Set<number> {
  const out = new Set<number>();
  for (const y of REFORM_YEARS) {
    const row = rates[y];
    if (!row) {
      out.add(y);
      continue;
    }
    let allBaseline = true;
    for (let i = 0; i < MO_2025_RATES.length; i++) {
      if (Math.abs((row[i] ?? MO_2025_RATES[i]) - MO_2025_RATES[i]) > 1e-9) {
        allBaseline = false;
        break;
      }
    }
    if (allBaseline) out.add(y);
  }
  return out;
}

/** Linearly interpolate between two (year, value) endpoints. Clamps to the
 * closer endpoint outside the range. */
function interpolateRamp(
  y: number,
  startYear: number,
  endYear: number,
  startValue: number,
  endValue: number,
): number {
  if (startYear === endYear) return startValue;
  const a = Math.min(startYear, endYear);
  const b = Math.max(startYear, endYear);
  if (y <= a) return startYear <= endYear ? startValue : endValue;
  if (y >= b) return startYear <= endYear ? endValue : startValue;
  const t = (y - startYear) / (endYear - startYear);
  return startValue + (endValue - startValue) * t;
}

/** Build a year × bracket rates matrix for the top-rate cap path. */
export function buildCapRates(
  startYear: number,
  endYear: number,
  startPct: number,
  endPct: number,
): Record<number, number[]> {
  const out = defaultCustomRates();
  for (const y of REFORM_YEARS) {
    if (y < startYear) continue;
    const capPctY = interpolateRamp(y, startYear, endYear, startPct, endPct);
    const cap = Math.max(0, Math.min(10, capPctY)) / 100;
    for (let i = 1; i < out[y].length; i++) {
      if (out[y][i] > cap) out[y][i] = cap;
    }
  }
  return out;
}

/** Build a year × bracket rates matrix for the percentage-point cut path. */
export function buildPpRates(
  startYear: number,
  endYear: number,
  startPp: number,
  endPp: number,
): Record<number, number[]> {
  const out = defaultCustomRates();
  for (const y of REFORM_YEARS) {
    if (y < startYear) continue;
    const ppY = interpolateRamp(y, startYear, endYear, startPp, endPp);
    const pp = Math.max(0, Math.min(10, ppY)) / 100;
    for (let i = 1; i < out[y].length; i++) {
      out[y][i] = Math.max(0, out[y][i] - pp);
    }
  }
  return out;
}

/** Build a year × bracket rates matrix for a proportional (percentage)
 * cut of each bracket's 2025 baseline rate. `startPct` and `endPct` are
 * the share *removed* (e.g. 0.20 = drop every rate by 20%); the cut is
 * interpolated linearly between the start and end years. */
export function buildPctRates(
  startYear: number,
  endYear: number,
  startPct: number,
  endPct: number,
): Record<number, number[]> {
  const out = defaultCustomRates();
  for (const y of REFORM_YEARS) {
    if (y < startYear) continue;
    const cutY = interpolateRamp(y, startYear, endYear, startPct, endPct);
    const cut = Math.max(0, Math.min(1, cutY));
    for (let i = 1; i < out[y].length; i++) {
      out[y][i] = MO_2025_RATES[i] * (1 - cut);
    }
  }
  return out;
}

/** Build a year × bracket rates matrix that *phases* every editable
 * bracket from its 2025 baseline rate down to zero between `startYear`
 * and `endYear`. Years on or after `endYear` are zeroed; years strictly
 * before `startYear` are unchanged. */
export function buildEliminateRates(
  startYear: number,
  endYear: number,
): Record<number, number[]> {
  const out = defaultCustomRates();
  for (const y of REFORM_YEARS) {
    if (y < startYear) continue;
    if (y >= endYear) {
      for (let i = 1; i < out[y].length; i++) out[y][i] = 0;
      continue;
    }
    const t = endYear === startYear ? 1 : (y - startYear) / (endYear - startYear);
    for (let i = 1; i < out[y].length; i++) {
      out[y][i] = MO_2025_RATES[i] * (1 - t);
    }
  }
  return out;
}
