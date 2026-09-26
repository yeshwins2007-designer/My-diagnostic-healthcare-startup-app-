/**
 * Cold chain.
 *
 * Routine biochemistry and haematology tolerate a two-hour transit in a
 * temperature-controlled box. They do not tolerate a box that was never sealed
 * or that sat in a two-wheeler pannier in a Bengaluru afternoon. A missing or
 * out-of-range log blocks the custody handoff, because a handoff record
 * without temperature evidence is a record of nothing.
 */

import { allow, refuse, warn, type Decision } from './types';

/** Acceptable band for whole blood and serum in transit. */
export const COLD_CHAIN_MIN_C = 2;
export const COLD_CHAIN_MAX_C = 8;
/** Log at least this often while in transit. */
export const LOG_INTERVAL_MINUTES = 5;

export interface TemperatureReading {
  temperatureC: number;
  recordedAt: Date;
  boxSealed: boolean;
}

export function isBreach(temperatureC: number): boolean {
  return temperatureC < COLD_CHAIN_MIN_C || temperatureC > COLD_CHAIN_MAX_C;
}

export function classifyReading(temperatureC: number): Decision {
  if (isBreach(temperatureC)) {
    return refuse(
      `${temperatureC.toFixed(1)} °C is outside the ${COLD_CHAIN_MIN_C}–${COLD_CHAIN_MAX_C} °C band.`,
      'Re-ice the box and log again. If the sample has been out of range for more than a few minutes, treat it as compromised: raise an incident and book a free recollection rather than delivering a sample you do not trust.',
      { temperatureC },
    );
  }
  if (temperatureC <= COLD_CHAIN_MIN_C + 1 || temperatureC >= COLD_CHAIN_MAX_C - 1) {
    return warn(`${temperatureC.toFixed(1)} °C is close to the edge of the acceptable band.`);
  }
  return allow();
}

export interface HandoffGateInput {
  readings: TemperatureReading[];
  collectedAt: Date | null;
  now?: Date;
}

/**
 * The gate on step 8 of the SOP. A technician cannot record a handoff until
 * the box has been sealed and logged — that is what makes the chain of custody
 * a chain rather than a claim.
 */
export function evaluateHandoffReadiness(input: HandoffGateInput): Decision {
  if (!input.collectedAt) {
    return refuse(
      'Nothing has been collected yet.',
      'Complete the collection and bedside labelling steps first.',
    );
  }

  if (input.readings.length === 0) {
    return refuse(
      'No temperature has been logged for this box.',
      'Log the cold-box temperature and seal it before handing over. A handoff without a temperature record cannot be audited.',
    );
  }

  const latest = [...input.readings].sort(
    (a, b) => b.recordedAt.getTime() - a.recordedAt.getTime(),
  )[0];

  if (!latest.boxSealed) {
    return refuse(
      'The cold box is not recorded as sealed.',
      'Seal the box, then log the sealing temperature.',
    );
  }

  const breaches = input.readings.filter((r) => isBreach(r.temperatureC));
  if (breaches.length > 0) {
    return refuse(
      `${breaches.length} temperature ${breaches.length === 1 ? 'reading is' : 'readings are'} outside the acceptable band.`,
      'Raise a cold-chain incident and arrange a free recollection. Do not hand over a sample whose temperature history you cannot stand behind.',
      { breaches: breaches.map((b) => b.temperatureC) },
    );
  }

  const now = input.now ?? new Date();
  const staleMinutes = Math.round((now.getTime() - latest.recordedAt.getTime()) / 60_000);
  if (staleMinutes > LOG_INTERVAL_MINUTES * 3) {
    return warn(
      `The last temperature reading is ${staleMinutes} minutes old. Log a fresh one at the intake desk.`,
      { staleMinutes },
    );
  }

  return allow();
}

/** Rough transit gap check, used by the ops console to spot missing logs. */
export function findLoggingGaps(
  readings: TemperatureReading[],
  maxGapMinutes = LOG_INTERVAL_MINUTES * 3,
): { fromISO: string; toISO: string; gapMinutes: number }[] {
  const sorted = [...readings].sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime(),
  );
  const gaps: { fromISO: string; toISO: string; gapMinutes: number }[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const gap = Math.round(
      (sorted[i].recordedAt.getTime() - sorted[i - 1].recordedAt.getTime()) / 60_000,
    );
    if (gap > maxGapMinutes) {
      gaps.push({
        fromISO: sorted[i - 1].recordedAt.toISOString(),
        toISO: sorted[i].recordedAt.toISOString(),
        gapMinutes: gap,
      });
    }
  }
  return gaps;
}
