/**
 * The two-hour sample rule.
 *
 * "Collection to lab intake within 2 hours, in a temperature-controlled box,
 * with time logged." This is the constraint that draws the service map, so it
 * gets a live countdown rather than a retrospective report — an operator needs
 * to know at minute 90 that a sample is at risk, not at minute 130 that it was.
 */

import { allow, refuse, warn, type Decision } from './types';

/** Default ceiling; overridden per test by its own stability window. */
export const DEFAULT_CLOCK_MINUTES = 120;
/** Amber at 75% of the budget. */
const AMBER_FRACTION = 0.75;

export type ClockState = 'NOT_STARTED' | 'GREEN' | 'AMBER' | 'BREACHED' | 'CLOSED';

export interface ClockReading {
  state: ClockState;
  elapsedMinutes: number;
  remainingMinutes: number;
  budgetMinutes: number;
  /** 0..1, for a progress ring. Clamped so a breach does not overflow the UI. */
  fraction: number;
  label: string;
}

export function readClock(input: {
  clockStartsAt: Date | null;
  intakeAt: Date | null;
  /** Tightest stability window across the specimens in this box. */
  budgetMinutes?: number;
  now?: Date;
}): ClockReading {
  const budget = input.budgetMinutes ?? DEFAULT_CLOCK_MINUTES;
  const now = input.now ?? new Date();

  if (!input.clockStartsAt) {
    return {
      state: 'NOT_STARTED',
      elapsedMinutes: 0,
      remainingMinutes: budget,
      budgetMinutes: budget,
      fraction: 0,
      label: 'Not collected yet',
    };
  }

  const end = input.intakeAt ?? now;
  const elapsed = Math.max(0, Math.round((end.getTime() - input.clockStartsAt.getTime()) / 60_000));
  const remaining = budget - elapsed;
  const fraction = Math.min(1, elapsed / budget);

  if (input.intakeAt) {
    return {
      state: 'CLOSED',
      elapsedMinutes: elapsed,
      remainingMinutes: remaining,
      budgetMinutes: budget,
      fraction,
      label:
        elapsed > budget
          ? `Delivered late — ${elapsed} min (budget ${budget})`
          : `Delivered in ${elapsed} min`,
    };
  }

  if (elapsed > budget) {
    return {
      state: 'BREACHED',
      elapsedMinutes: elapsed,
      remainingMinutes: remaining,
      budgetMinutes: budget,
      fraction: 1,
      label: `${elapsed - budget} min over the ${budget}-minute limit`,
    };
  }

  if (elapsed >= budget * AMBER_FRACTION) {
    return {
      state: 'AMBER',
      elapsedMinutes: elapsed,
      remainingMinutes: remaining,
      budgetMinutes: budget,
      fraction,
      label: `${remaining} min left — go straight to the lab`,
    };
  }

  return {
    state: 'GREEN',
    elapsedMinutes: elapsed,
    remainingMinutes: remaining,
    budgetMinutes: budget,
    fraction,
    label: `${remaining} min left`,
  };
}

/**
 * The budget for a box is the *tightest* stability window in it. Mixing a
 * 2-hour-stable tube with a 6-hour-stable one does not give you six hours.
 */
export function budgetForSpecimens(stabilityHoursPerTest: number[]): number {
  if (stabilityHoursPerTest.length === 0) return DEFAULT_CLOCK_MINUTES;
  const tightestHours = Math.min(...stabilityHoursPerTest);
  return Math.min(DEFAULT_CLOCK_MINUTES, Math.round(tightestHours * 60));
}

/**
 * Called when the intake desk tries to accept a sample. A breach does not
 * block acceptance — the lab still needs to log what arrived — but it forces
 * an incident and a free recollection rather than being quietly absorbed.
 */
export function evaluateIntake(reading: ClockReading): Decision {
  if (reading.state === 'BREACHED') {
    return refuse(
      `This sample is ${reading.elapsedMinutes} minutes old, past the ${reading.budgetMinutes}-minute limit.`,
      'Accept it into the log, then raise a Tier 1 incident and book a free recollection within 24 hours. Do not let a degraded sample become a result.',
      { elapsedMinutes: reading.elapsedMinutes },
    );
  }
  if (reading.state === 'AMBER') {
    return warn(`Intake at ${reading.elapsedMinutes} minutes — inside the limit but close.`);
  }
  return allow();
}
