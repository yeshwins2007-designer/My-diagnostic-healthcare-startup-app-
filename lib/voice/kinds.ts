/**
 * The six calls the assistant makes, and the rules each one keeps.
 *
 * The titles and lines here are what a family reads in the first-run sheet
 * and in Profile before turning a call on, and they are stored with the
 * family's choice as the wording they agreed to. Calling hours are local to
 * whoever picks up.
 */

import type { VoiceCallKind } from '../enums';
import { hm, type CallingHours } from './time';

export interface CallKindPolicy {
  kind: VoiceCallKind;
  /** Who the call is for. PATIENT calls go to the family when the parent has no phone. */
  to: 'PATIENT' | 'FAMILY';
  /** Grouping in the sheet and in Profile. */
  section: 'PARENT' | 'YOU';
  hours: CallingHours;
  maxAttempts: number;
  /** Wait before trying again after no answer. */
  retryAfterMinutes: number;
  title: string;
  /** One line, in plain words. `parent` is the parent's first name. */
  line: (parent: string) => string;
  /** The picture in the sheet: an SF Symbols-like glyph name in components/call-icons.tsx. */
  icon: 'moon' | 'door' | 'heart' | 'doc' | 'calendar' | 'bell';
}

export const CALL_KINDS: CallKindPolicy[] = [
  {
    kind: 'FASTING_PREP',
    to: 'PATIENT',
    section: 'PARENT',
    hours: { from: hm(17, 30), to: hm(20, 30) },
    maxAttempts: 2,
    retryAfterMinutes: 30,
    title: 'The night before a fasting test',
    line: (p) => `We call ${p} to explain fasting in plain words, then ask them to say it back.`,
    icon: 'moon',
  },
  {
    kind: 'MISSED_DOOR',
    to: 'PATIENT',
    section: 'PARENT',
    hours: { from: hm(6), to: hm(21) },
    maxAttempts: 1,
    retryAfterMinutes: 0,
    title: 'If no one opens the door',
    line: (p) => `We call ${p}, then you, while the technician is still outside.`,
    icon: 'door',
  },
  {
    kind: 'POST_VISIT_CHECKIN',
    to: 'PATIENT',
    section: 'PARENT',
    hours: { from: hm(10), to: hm(19, 30) },
    maxAttempts: 2,
    retryAfterMinutes: 180,
    title: 'After each visit',
    line: (p) => `Two questions for ${p}: was the technician on time, and gentle?`,
    icon: 'heart',
  },
  {
    kind: 'REPORT_READY',
    to: 'FAMILY',
    section: 'YOU',
    hours: { from: hm(8, 30), to: hm(21) },
    maxAttempts: 2,
    retryAfterMinutes: 180,
    title: 'When the report is ready',
    line: () => 'A call to say it’s in the app. A person still calls to go through it with you.',
    icon: 'doc',
  },
  {
    kind: 'MONTHLY_UPDATE',
    to: 'FAMILY',
    section: 'YOU',
    hours: { from: hm(18), to: hm(21) },
    maxAttempts: 2,
    retryAfterMinutes: 24 * 60,
    title: 'A monthly update',
    line: (p) => `One minute a month: ${p}’s visits, what’s next, and anything we noticed.`,
    icon: 'calendar',
  },
  {
    kind: 'DUE_NUDGE',
    to: 'FAMILY',
    section: 'YOU',
    hours: { from: hm(10), to: hm(20) },
    maxAttempts: 1,
    retryAfterMinutes: 0,
    title: 'When the next test is due',
    line: (p) => `A reminder a few days ahead, and we can hold ${p}’s usual slot for you to confirm.`,
    icon: 'bell',
  },
];

export function callPolicy(kind: VoiceCallKind): CallKindPolicy {
  const policy = CALL_KINDS.find((k) => k.kind === kind);
  if (!policy) throw new Error(`Unknown call kind ${kind}`);
  return policy;
}

/** What the family agreed to, word for word, for the consent record. */
export function consentWording(kind: VoiceCallKind, parent: string): string {
  const p = callPolicy(kind);
  return `${p.title}: ${p.line(parent)} (Calls open by saying they are MEDWYN's automated assistant, and never discuss results.)`;
}

/** How often a parent's tests repeat: the service is a monthly visit. */
export const VISIT_EVERY_DAYS = 30;
/** How far ahead of the due date the reminder rings. */
export const NUDGE_DAYS_BEFORE = 4;
/** A slot held by phone waits this long for the family to confirm it. */
export const REQUEST_HOLD_HOURS = 48;
