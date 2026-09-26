/**
 * The critical-value protocol.
 *
 * "When the lab flags a critical result: the pathologist's communication
 * process runs first, per the lab's own protocol. Your parallel duty is to
 * phone the registered caregiver immediately, state plainly that a result
 * needs urgent medical attention, advise contacting their physician or
 * emergency services, log the call with a timestamp, and follow up in writing.
 * Never interpret the value, never advise treatment, never delay the call to a
 * convenient hour."
 *
 * The script below is deliberately not editable free text. Everything a
 * coordinator says on this call is non-interpretive by construction — the
 * numeric value never appears in it.
 */

import { brand } from '../brand';
import { refuse, allow, type Decision } from './types';

export interface CriticalCallScript {
  /** What the coordinator reads out, in order. */
  lines: string[];
  /** Things that must never be said, shown next to the script as a reminder. */
  neverSay: string[];
}

export function buildCriticalCallScript(input: {
  caregiverName: string;
  patientName: string;
  parameterName: string;
  coordinatorName: string;
}): CriticalCallScript {
  return {
    lines: [
      `Good morning / good evening, is that ${input.caregiverName}?`,
      `This is ${input.coordinatorName} from ${brand.name}. I am calling about ${input.patientName}'s test from today.`,
      `One of the results — the ${input.parameterName} — has been flagged by the laboratory as needing urgent medical attention.`,
      `I am not able to explain what the result means; only a doctor can do that.`,
      `Please contact ${input.patientName}'s physician today. If ${input.patientName} is unwell right now — chest pain, breathlessness, confusion, or unable to be woken — please call ${brand.emergencyNumber} or go to the nearest hospital immediately.`,
      `The laboratory's pathologist is also following their own process to reach you or the doctor.`,
      `I will send you this in writing straight after this call, and I will call again tomorrow to check that you reached someone.`,
      `Is there anything about the appointment or the report delivery I can help with?`,
    ],
    neverSay: [
      'Any interpretation of what the number means',
      'Any suggestion of a medicine, a dose, or a change to existing medication',
      'Any reassurance that it is "probably fine" or any statement that it is "very serious"',
      'Any named diagnosis',
      'The numeric value itself, unless the caregiver already has the report in front of them and asks you to confirm what is printed',
    ],
  };
}

/**
 * A critical alert cannot be closed until the caregiver has actually been
 * reached and it has been put in writing. "We tried" is not a completed
 * protocol.
 */
export function evaluateAlertClosure(alert: {
  calledAt: Date | null;
  callNote: string;
  writtenFollowUpSentAt: Date | null;
}): Decision {
  if (!alert.calledAt) {
    return refuse(
      'The caregiver has not been called yet.',
      'Place the call now, using the script. This is the one task that never waits for a convenient hour.',
    );
  }
  if (alert.callNote.trim().length < 10) {
    return refuse(
      'The call has no logged note.',
      'Record who you spoke to and what they said they would do. A timestamp alone is not a record of the conversation.',
    );
  }
  if (!alert.writtenFollowUpSentAt) {
    return refuse(
      'The written follow-up has not been sent.',
      'Send the written summary before closing. A phone call alone leaves the family with nothing to show their doctor.',
    );
  }
  return allow();
}

/**
 * How overdue an open alert is, in minutes. The ops console sorts by this and
 * nothing else can outrank it on the screen.
 */
export function minutesOpen(raisedAt: Date, now = new Date()): number {
  return Math.max(0, Math.round((now.getTime() - raisedAt.getTime()) / 60_000));
}

/** Escalation ladder. Deliberately aggressive: minutes, not hours. */
export function escalationLevel(raisedAt: Date, now = new Date()): {
  level: 'NEW' | 'URGENT' | 'ESCALATE_TO_FOUNDER';
  minutes: number;
  message: string;
} {
  const minutes = minutesOpen(raisedAt, now);
  if (minutes >= 30) {
    return {
      level: 'ESCALATE_TO_FOUNDER',
      minutes,
      message: `Open for ${minutes} minutes. Escalate to the founder and the partner lab's medical director now.`,
    };
  }
  if (minutes >= 10) {
    return {
      level: 'URGENT',
      minutes,
      message: `Open for ${minutes} minutes. Call before doing anything else.`,
    };
  }
  return { level: 'NEW', minutes, message: 'Call the registered caregiver now.' };
}
