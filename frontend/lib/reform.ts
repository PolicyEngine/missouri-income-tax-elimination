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
  | 'full_eliminate';

/** Missouri's 2025 tax bracket rates (indices 0–7). */
export const MO_2025_RATES: number[] = [
  0, 0.02, 0.025, 0.03, 0.035, 0.04, 0.045, 0.047,
];

/** Period covered by every reform ("2026-01-01.2100-12-31"). */
const PERIOD = '2026-01-01.2100-12-31';

/**
 * Build a reform dict for the PolicyEngine API based on the selected reform
 * type and its parameter.
 *
 * Parameter interpretation by reform type:
 *   - proportional:    param is the fractional cut in [0, 1]. e.g. 0.5 =
 *                      cut every non-zero bracket rate in half.
 *   - top_cap:         param is the new top-bracket rate as a decimal
 *                      (e.g. 0.03 for 3%).
 *   - eliminate_top:   param is unused. Sets rates[7].threshold to a very
 *                      large number (999999999) to effectively merge the top
 *                      bracket into the next one down.
 *   - full_eliminate:  param is unused. Sets every non-zero bracket rate to 0.
 */
export function buildReform(
  type: ReformType,
  param: number,
): Record<string, Record<string, number | boolean>> {
  const reform: Record<string, Record<string, number | boolean>> = {};

  if (type === 'proportional') {
    // Multiply every non-zero bracket rate by (1 - param).
    // Bracket 0 is already 0% so we skip it.
    const factor = 1 - param;
    for (let i = 1; i < MO_2025_RATES.length; i++) {
      const newRate = MO_2025_RATES[i] * factor;
      reform[`gov.states.mo.tax.income.rates[${i}].rate`] = {
        [PERIOD]: newRate,
      };
    }
    return reform;
  }

  if (type === 'top_cap') {
    // Set the 4.7% top bracket to the chosen rate.
    reform['gov.states.mo.tax.income.rates[7].rate'] = {
      [PERIOD]: param,
    };
    return reform;
  }

  if (type === 'eliminate_top') {
    // Push the top bracket's threshold to "infinity" (999_999_999) so the
    // rate never applies. JSON cannot represent .inf, so we use a large
    // finite value.
    reform['gov.states.mo.tax.income.rates[7].threshold'] = {
      [PERIOD]: 999999999,
    };
    return reform;
  }

  if (type === 'full_eliminate') {
    // Zero every non-zero bracket rate.
    for (let i = 1; i < MO_2025_RATES.length; i++) {
      reform[`gov.states.mo.tax.income.rates[${i}].rate`] = {
        [PERIOD]: 0,
      };
    }
    return reform;
  }

  return reform;
}
