/**
 * The promised window, and the rule that a call before a delay is forgivable
 * but silence is not.
 *
 * There is no speed SLA anywhere in this product. What is measured is whether
 * we arrived inside the sixty-minute window we promised — a promise a small
 * operator can actually keep, unlike "fifteen minutes", which is a race
 * against companies with far more capital.
 */

import { estimateMinutes, haversineKm, type LatLng } from '../geo';
import { allow, warn, refuse, type Decision } from './types';

export const WINDOW_MINUTES = 60;
/** Fasting samples dominate; 70%+ of volume is between 06:30 and 10:00. */
export const MORNING_WINDOW_START_HOUR = 6.5;
export const MORNING_WINDOW_END_HOUR = 10;
/** Routes must be fixed before this time, per the SOP. */
export const ROUTE_FIX_DEADLINE_HOUR = 6.5;

export type ArrivalVerdict = 'EARLY' | 'ON_TIME' | 'LATE' | 'PENDING';

export function classifyArrival(input: {
  windowStart: Date;
  windowEnd: Date;
  arrivedAt: Date | null;
}): ArrivalVerdict {
  if (!input.arrivedAt) return 'PENDING';
  if (input.arrivedAt < input.windowStart) return 'EARLY';
  if (input.arrivedAt <= input.windowEnd) return 'ON_TIME';
  return 'LATE';
}

/**
 * On-time means "inside the window". Arriving early at an elderly patient's
 * door at 6:10 for a 6:30–7:30 slot is not a triumph — they may not be ready,
 * and it counts as on-time only because we did not make them wait.
 */
export function countsAsOnTime(verdict: ArrivalVerdict): boolean {
  return verdict === 'ON_TIME' || verdict === 'EARLY';
}

export interface DelayCheck {
  decision: Decision;
  projectedArrival: Date;
  willBreachWindow: boolean;
  minutesLate: number;
}

/**
 * Run continuously while a technician is en route. The moment the projection
 * says the window will be missed, the family is notified — *before* the window
 * ends, not after.
 */
export function projectArrival(input: {
  technicianPosition: LatLng;
  destination: LatLng;
  windowEnd: Date;
  now?: Date;
  averageKmh?: number;
  /** Set once the family has already been warned, so we do not spam them. */
  alreadyNotified: boolean;
}): DelayCheck {
  const now = input.now ?? new Date();
  const distanceKm = haversineKm(input.technicianPosition, input.destination);
  const minutes = estimateMinutes(distanceKm, input.averageKmh ?? 18);
  const projectedArrival = new Date(now.getTime() + minutes * 60_000);

  const minutesLate = Math.round(
    (projectedArrival.getTime() - input.windowEnd.getTime()) / 60_000,
  );
  const willBreachWindow = minutesLate > 0;

  if (!willBreachWindow) {
    return { decision: allow(), projectedArrival, willBreachWindow, minutesLate: 0 };
  }

  if (input.alreadyNotified) {
    return {
      decision: warn(
        `Still projected ${minutesLate} minutes late. The family has been told.`,
        { minutesLate },
      ),
      projectedArrival,
      willBreachWindow,
      minutesLate,
    };
  }

  return {
    decision: refuse(
      `Projected to arrive ${minutesLate} minutes after the promised window closes.`,
      'Call or message the family now, before the window ends. A call before a delay is forgivable; silence is not.',
      { minutesLate, distanceKm },
    ),
    projectedArrival,
    willBreachWindow,
    minutesLate,
  };
}

/** Builds the morning slots a family can choose from. */
export function morningSlots(date: Date, slotMinutes = WINDOW_MINUTES): { start: Date; end: Date; label: string }[] {
  const slots: { start: Date; end: Date; label: string }[] = [];
  const startMinutes = MORNING_WINDOW_START_HOUR * 60;
  const endMinutes = MORNING_WINDOW_END_HOUR * 60;

  for (let m = startMinutes; m + slotMinutes <= endMinutes; m += slotMinutes) {
    const start = new Date(date);
    start.setHours(Math.floor(m / 60), m % 60, 0, 0);
    const end = new Date(start.getTime() + slotMinutes * 60_000);
    slots.push({ start, end, label: `${fmt(start)} – ${fmt(end)}` });
  }
  return slots;
}

function fmt(d: Date): string {
  return d.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Fasting instructions in plain language. Sent the evening before, never the
 * morning of — an 80-year-old who reads it at 6 AM has already had their tea.
 */
export function fastingInstruction(fastingHours: number, windowStart: Date): string {
  if (fastingHours <= 0) {
    return 'No fasting is needed for tomorrow’s tests. Please eat and drink as usual.';
  }
  const stopEating = new Date(windowStart.getTime() - fastingHours * 3_600_000);
  return [
    `Tomorrow’s tests need ${fastingHours} hours of fasting.`,
    `Please finish dinner by ${fmt(stopEating)} tonight.`,
    'After that, plain water is fine — please keep drinking water.',
    'Do not stop any regular medicine unless your doctor has told you to.',
  ].join(' ');
}
