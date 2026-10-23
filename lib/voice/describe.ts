/**
 * A call, in a line a family (or a coordinator) can read at a glance. Built
 * from the call's outcome, never from what was said on it.
 */

import type { VoiceCall } from '@prisma/client';
import type { VoiceCallKind } from '../enums';
import { callPolicy } from './kinds';
import { readOutcome } from './outcomes';
import { firstName } from './scripts';

export function callTitle(kind: string): string {
  try {
    return callPolicy(kind as VoiceCallKind).title;
  } catch {
    return 'Call';
  }
}

export function callResultLine(call: Pick<VoiceCall, 'kind' | 'status' | 'recipientName' | 'outcomeJson' | 'statusReason'>): string {
  const who = firstName(call.recipientName);
  switch (call.status) {
    case 'SCHEDULED':
      return `Planned: we’ll ring ${who}.`;
    case 'DIALING':
      return `Ringing ${who} now.`;
    case 'NO_ANSWER':
      return `${who} didn’t pick up.`;
    case 'FAILED':
      return `Couldn’t connect to ${who}.`;
    case 'CANCELLED':
      return `Not made: ${call.statusReason || 'no longer needed'}`;
    case 'SIMULATED':
      return `Not dialled: this demo has no phone line. It would have rung ${who}.`;
  }
  const o = readOutcome(call);
  switch (call.kind) {
    case 'FASTING_PREP':
      return o?.fastingUnderstood === 'no' || o?.medicineQuestion
        ? `${who} had a question about the visit, so a coordinator is calling.`
        : `${who} repeated the fasting rule back correctly.`;
    case 'MISSED_DOOR':
      return o?.doorResponse === 'coming'
        ? `${who} came to the door.`
        : o?.doorResponse
          ? `${who} wasn’t home. A coordinator is rearranging the visit.`
          : `${who} answered.`;
    case 'POST_VISIT_CHECKIN': {
      const said = (a?: string) => (a === 'YES' ? 'yes' : a === 'NO' ? 'no' : 'not sure');
      return `On time: ${said(o?.onTime)}. Gentle: ${said(o?.gentle)}.`;
    }
    case 'REPORT_READY':
      return `Told ${who} the report is in the app.`;
    case 'MONTHLY_UPDATE':
      return `Gave ${who} the monthly update.`;
    case 'DUE_NUDGE':
      return o?.wantsBooking ? `Held a visit for you to confirm.` : `${who} didn’t want a visit just now.`;
  }
  return 'Done.';
}
