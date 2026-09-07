/**
 * The 24-hour follow-up call.
 *
 * "Call every family 24 hours after their report. Ask two questions: what
 * worried you, and what would make you do this every month?" The blueprint is
 * explicit that this single step drives most of retention — so it is not a
 * reminder, it is a task that is created automatically on every release and
 * that dominates the ops screen once it is overdue.
 */

import { allow, refuse, type Decision } from './types';

export const FOLLOW_UP_WINDOW_HOURS = 24;

export function dueBy(reportReleasedAt: Date): Date {
  return new Date(reportReleasedAt.getTime() + FOLLOW_UP_WINDOW_HOURS * 3_600_000);
}

export type FollowUpUrgency = 'SCHEDULED' | 'DUE_SOON' | 'OVERDUE';

export function urgency(due: Date, now = new Date()): {
  level: FollowUpUrgency;
  hoursRemaining: number;
  label: string;
} {
  const hours = (due.getTime() - now.getTime()) / 3_600_000;

  if (hours < 0) {
    const late = Math.abs(Math.round(hours));
    return {
      level: 'OVERDUE',
      hoursRemaining: hours,
      label: `${late} hour${late === 1 ? '' : 's'} overdue`,
    };
  }
  if (hours <= 6) {
    return {
      level: 'DUE_SOON',
      hoursRemaining: hours,
      label: `Due in ${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'}`,
    };
  }
  return {
    level: 'SCHEDULED',
    hoursRemaining: hours,
    label: `Due in ${Math.round(hours)} hours`,
  };
}

/**
 * The call is not complete until both questions have an answer. A tick-box
 * without the answers is how a retention driver quietly decays into a
 * formality that nobody learns anything from.
 */
export function evaluateCompletion(input: {
  whatWorriedYou: string;
  whatWouldImprove: string;
}): Decision {
  if (input.whatWorriedYou.trim().length < 3 || input.whatWouldImprove.trim().length < 3) {
    return refuse(
      'Both questions need an answer before this call can be marked done.',
      'Ask: "What worried you?" and "What would make you do this every month?" — then write down what they actually said. If they said "nothing", write "nothing".',
    );
  }
  return allow();
}

/** The two questions, verbatim, so every coordinator asks the same thing. */
export const FOLLOW_UP_QUESTIONS = [
  'What worried you?',
  'What would make you do this every month?',
] as const;
