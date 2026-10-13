/**
 * Turning what a lab types into report parameters.
 *
 * Pure: no database, no clock. The lab action calls it and stores what it
 * returns, so every rule here is unit-tested directly. The rules, each one a
 * bug the earlier inline version had:
 *
 *   - every test in the order, panel or single, must get a value; none is
 *     silently dropped (a missing value used to produce a GREEN report)
 *   - a code that is not in the order is an error, not ignored (a typo used
 *     to vanish)
 *   - a blank value is an error, not 0 (0 used to read as a critical low)
 *   - a test with a numeric range needs a number; "9.4%" or "9,4" is an
 *     error, not silently GREEN
 */

import type { StoplightBand } from '../enums';

/**
 * Reference ranges, hardcoded, so banding is the same every time and
 * traceable. Banding is arithmetic against these, never a model's opinion.
 */
export const REFERENCE_RANGES: Record<string, { refLow: number | null; refHigh: number | null; unit: string }> = {
  HBA1C: { refLow: 4.0, refHigh: 5.7, unit: '%' },
  GLU_F: { refLow: 70, refHigh: 100, unit: 'mg/dL' },
  LIPID: { refLow: 0, refHigh: 200, unit: 'mg/dL' },
  CREAT: { refLow: 0.6, refHigh: 1.3, unit: 'mg/dL' },
  UREA: { refLow: 15, refHigh: 45, unit: 'mg/dL' },
  ELEC: { refLow: 135, refHigh: 145, unit: 'mmol/L' },
  CBC: { refLow: 12, refHigh: 16, unit: 'g/dL' },
  TSH: { refLow: 0.4, refHigh: 4.5, unit: 'µIU/mL' },
  VITD: { refLow: 30, refHigh: 100, unit: 'ng/mL' },
  B12: { refLow: 200, refHigh: 900, unit: 'pg/mL' },
  URINE_R: { refLow: null, refHigh: null, unit: '' },
  URINE_CS: { refLow: null, refHigh: null, unit: '' },
};

export interface OrderTest {
  id: string;
  code: string;
  name: string;
}

export interface ParsedParameter {
  testId: string;
  code: string;
  value: string;
  unit: string;
  refLow: number | null;
  refHigh: number | null;
  band: StoplightBand;
  isCritical: boolean;
}

export type ParseResult =
  | { ok: true; parameters: ParsedParameter[]; overall: StoplightBand }
  | { ok: false; errors: string[] };

/** Bands one numeric value. Outside the range is YELLOW; far outside is RED. */
export function bandFor(code: string, value: number): { band: StoplightBand; isCritical: boolean } {
  const range = REFERENCE_RANGES[code];
  if (!range || range.refLow === null || range.refHigh === null) return { band: 'GREEN', isCritical: false };
  const { refLow, refHigh } = range;
  if (value >= refLow && value <= refHigh) return { band: 'GREEN', isCritical: false };
  const span = refHigh - refLow;
  if (value < refLow - span * 0.5 || value > refHigh + span * 0.5) return { band: 'RED', isCritical: true };
  return { band: 'YELLOW', isCritical: false };
}

const NUMBER = /^-?\d+(\.\d+)?$/;

/**
 * Parses "HBA1C=9.4 | GLU_F=186" (pipes or new lines) against the tests in
 * the order. All-or-nothing: any error and nothing is stored.
 */
export function parseResultValues(raw: string, tests: OrderTest[]): ParseResult {
  const errors: string[] = [];
  const byCode = new Map(tests.map((t) => [t.code.toUpperCase(), t]));
  const seen = new Map<string, string>();

  const pairs = raw
    .split(/[|\n]/)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq < 1) {
      errors.push(`“${pair}” is not in CODE=value form.`);
      continue;
    }
    const code = pair.slice(0, eq).trim().toUpperCase();
    const value = pair.slice(eq + 1).trim();
    if (!byCode.has(code)) {
      errors.push(`${code} is not a test in this order. Its codes are ${[...byCode.keys()].join(', ')}.`);
      continue;
    }
    if (seen.has(code)) {
      errors.push(`${code} is entered twice.`);
      continue;
    }
    if (value === '') {
      errors.push(`${code} has no value.`);
      continue;
    }
    const range = REFERENCE_RANGES[code];
    if (range && range.refLow !== null && !NUMBER.test(value)) {
      errors.push(`${code} needs a plain number, such as 9.4 (no units, commas or symbols).`);
      continue;
    }
    seen.set(code, value);
  }

  const missing = [...byCode.keys()].filter((c) => !seen.has(c));
  if (missing.length > 0 && errors.length === 0) {
    errors.push(`Every test in the order needs a value. Missing: ${missing.join(', ')}.`);
  }
  if (errors.length > 0) return { ok: false, errors };

  const parameters = [...seen.entries()].map(([code, value]): ParsedParameter => {
    const test = byCode.get(code)!;
    const range = REFERENCE_RANGES[code] ?? { refLow: null, refHigh: null, unit: '' };
    const { band, isCritical } = range.refLow !== null ? bandFor(code, Number(value)) : { band: 'GREEN' as StoplightBand, isCritical: false };
    return { testId: test.id, code, value, unit: range.unit, refLow: range.refLow, refHigh: range.refHigh, band, isCritical };
  });

  const overall: StoplightBand = parameters.some((p) => p.band === 'RED')
    ? 'RED'
    : parameters.some((p) => p.band === 'YELLOW')
      ? 'YELLOW'
      : 'GREEN';
  return { ok: true, parameters, overall };
}

/**
 * Every distinct test in an order: the tests inside its panels and the
 * tests booked on their own. One definition, used wherever an order's tests
 * are needed (the earlier code read panels only, and lost single tests).
 */
export function testsOfOrder<T extends { id: string }>(
  items: { panel?: { items: { test: T }[] } | null; test?: T | null }[],
): T[] {
  const all = items.flatMap((i) => [...(i.panel?.items.map((pi) => pi.test) ?? []), ...(i.test ? [i.test] : [])]);
  return [...new Map(all.map((t) => [t.id, t])).values()];
}
