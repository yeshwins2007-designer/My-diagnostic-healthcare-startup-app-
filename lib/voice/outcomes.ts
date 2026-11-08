/**
 * What a finished call sets in motion.
 *
 * The agent never acts on its own say-so: it reports what it heard (the
 * fields in lib/voice/agent.ts), and this decides what follows, in code that
 * can be reviewed. A parent unsure about fasting, a medicine question, a
 * late or rough technician, anyone who asked for a person: each becomes a
 * ticket a coordinator sees. A door the parent can't open moves on to the
 * family. A "yes" to the usual slot becomes a request the family confirms.
 */

import type { VoiceCall } from '@prisma/client';
import { db } from '../db';
import { audit } from '../compliance/audit';
import type { VoiceCallKind } from '../enums';
import { callPolicy } from './kinds';
import { createBookingRequest } from './requests';
import { escalateDoorToFamily } from './scheduler';
import { firstName } from './scripts';

export interface CallResultInput {
  callId?: string;
  providerCallId?: string;
  /** False when nobody picked up (busy, no answer, a dead line). */
  answered: boolean;
  failureReason?: string;
  /** The data-collection fields, as the provider reports them. */
  data?: Record<string, unknown>;
  /** The provider's own short summary of the call. */
  summary?: string;
}

export interface CallOutcome {
  reached: boolean;
  fastingUnderstood?: 'yes' | 'no';
  medicineQuestion?: boolean;
  doorResponse?: 'coming' | 'not_home' | 'later';
  doorMessage?: string;
  onTime?: 'YES' | 'NO' | 'UNSURE';
  gentle?: 'YES' | 'NO' | 'UNSURE';
  visitComment?: string;
  wantsBooking?: boolean;
  bookingDate?: string;
  bookingHour?: number;
  wantsHuman?: boolean;
  humanReason?: string;
}

/** Provider fields arrive as `{ value }` objects or as plain values. */
function field(data: Record<string, unknown> | undefined, key: string): unknown {
  const raw = data?.[key];
  if (raw && typeof raw === 'object' && 'value' in raw) return (raw as { value: unknown }).value;
  return raw;
}
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
const bool = (v: unknown) => v === true || str(v).toLowerCase() === 'true' || str(v).toLowerCase() === 'yes';
const answer = (v: unknown): 'YES' | 'NO' | 'UNSURE' | undefined => {
  const s = str(v).toLowerCase();
  return s === 'yes' ? 'YES' : s === 'no' ? 'NO' : s ? 'UNSURE' : undefined;
};

export function normaliseOutcome(data: Record<string, unknown> | undefined, answered: boolean): CallOutcome {
  const reachedRaw = field(data, 'reached_person');
  const fu = str(field(data, 'fasting_understood')).toLowerCase();
  const door = str(field(data, 'door_response')).toLowerCase();
  const hour = Number(field(data, 'booking_hour'));
  return {
    reached: answered && (reachedRaw === undefined || reachedRaw === null || reachedRaw === '' ? true : bool(reachedRaw)),
    fastingUnderstood: fu === 'yes' || fu === 'no' ? fu : undefined,
    medicineQuestion: bool(field(data, 'medicine_question')) || undefined,
    doorResponse: door === 'coming' || door === 'not_home' || door === 'later' ? door : undefined,
    doorMessage: str(field(data, 'door_message')).slice(0, 200) || undefined,
    onTime: answer(field(data, 'on_time')),
    gentle: answer(field(data, 'gentle')),
    visitComment: str(field(data, 'visit_comment')).slice(0, 1000) || undefined,
    wantsBooking: bool(field(data, 'wants_booking')) || undefined,
    bookingDate: /^\d{4}-\d{2}-\d{2}$/.test(str(field(data, 'booking_date'))) ? str(field(data, 'booking_date')) : undefined,
    bookingHour: Number.isInteger(hour) && hour >= 6 && hour <= 10 ? hour : undefined,
    wantsHuman: bool(field(data, 'wants_human')) || undefined,
    humanReason: str(field(data, 'human_reason')).slice(0, 300) || undefined,
  };
}

async function ticket(call: VoiceCall, input: { category: string; subject: string; body?: string; priority: string }) {
  await db.supportTicket.create({
    data: {
      familyId: call.familyId,
      source: 'VOICE_AGENT',
      category: input.category,
      subject: input.subject.slice(0, 160),
      body: input.body ?? '',
      priority: input.priority,
    },
  });
}

/** Turn a call's result into its outcome, and set off whatever follows. */
export async function recordCallResult(input: CallResultInput, now = new Date()): Promise<VoiceCall | null> {
  const call = input.callId
    ? await db.voiceCall.findUnique({ where: { id: input.callId } })
    : input.providerCallId
      ? await db.voiceCall.findUnique({ where: { providerCallId: input.providerCallId } })
      : null;
  // Only a call that is waiting for its result takes one: a replayed webhook changes nothing.
  if (!call || call.status !== 'DIALING') return call;

  const policy = callPolicy(call.kind as VoiceCallKind);
  const outcome = normaliseOutcome(input.data, input.answered);
  const booking = call.bookingId ? await db.booking.findUnique({ where: { id: call.bookingId }, include: { patient: true } }) : null;
  const patient = booking ? firstName(booking.patient.name) : 'the parent';
  const ref = booking?.reference ?? '';

  // Nobody picked up.
  if (!outcome.reached) {
    const retry = call.attempts < call.maxAttempts && policy.retryAfterMinutes > 0;
    const updated = await db.voiceCall.update({
      where: { id: call.id },
      data: retry
        ? { status: 'SCHEDULED', scheduledFor: new Date(now.getTime() + policy.retryAfterMinutes * 60_000), statusReason: input.failureReason ?? 'No answer' }
        : { status: 'NO_ANSWER', completedAt: now, statusReason: input.failureReason ?? 'No answer', outcomeJson: JSON.stringify(outcome) },
    });
    if (!retry) {
      if (call.kind === 'MISSED_DOOR') await escalateDoorToFamily(updated, now);
      if (call.kind === 'FASTING_PREP') {
        await ticket(call, {
          category: 'VISIT_PREPARATION',
          subject: `Couldn't reach ${firstName(call.recipientName)} about fasting for ${ref}: please call tonight`,
          priority: 'HIGH',
        });
      }
    }
    await finished(updated, outcome);
    return updated;
  }

  const updated = await db.voiceCall.update({
    where: { id: call.id },
    data: {
      status: 'COMPLETED',
      completedAt: now,
      outcomeJson: JSON.stringify(outcome),
      summary: (input.summary ?? call.summary).slice(0, 2000),
    },
  });

  switch (call.kind) {
    case 'FASTING_PREP':
      if (outcome.fastingUnderstood === 'no') {
        await ticket(call, {
          category: 'VISIT_PREPARATION',
          subject: `Call ${patient} tonight: not sure about fasting for tomorrow (${ref})`,
          body: 'The assistant explained twice and the fasting rule was not repeated back correctly.',
          priority: 'HIGH',
        });
      }
      if (outcome.medicineQuestion) {
        await ticket(call, {
          category: 'VISIT_PREPARATION',
          subject: `Medicine question before fasting for ${ref}: a person must answer`,
          body: outcome.humanReason ?? 'Asked about medicines on the night-before call.',
          priority: 'HIGH',
        });
      }
      break;
    case 'MISSED_DOOR':
      if (outcome.doorResponse === 'not_home' || outcome.doorResponse === 'later') {
        await ticket(call, {
          category: 'SCHEDULING',
          subject: `Rearrange ${ref}: ${patient} ${outcome.doorResponse === 'not_home' ? 'is not home today' : 'asked for another time'}`,
          body: outcome.doorMessage ?? '',
          priority: 'HIGH',
        });
      }
      break;
    case 'POST_VISIT_CHECKIN':
      if (booking && (outcome.onTime || outcome.gentle)) {
        await db.visitFeedback.upsert({
          where: { bookingId: booking.id },
          update: {},
          create: {
            bookingId: booking.id,
            technicianId: booking.technicianId,
            onTime: outcome.onTime ?? 'UNSURE',
            gentle: outcome.gentle ?? 'UNSURE',
            comment: outcome.visitComment ?? '',
            source: 'VOICE_CALL',
          },
        });
        if (outcome.onTime === 'NO' || outcome.gentle === 'NO') {
          await ticket(call, {
            category: 'VISIT_QUALITY',
            subject: `${patient}'s visit ${ref}: ${[outcome.onTime === 'NO' && 'late', outcome.gentle === 'NO' && 'not gentle'].filter(Boolean).join(' and ')}`,
            body: outcome.visitComment ?? '',
            priority: 'HIGH',
          });
        }
      }
      break;
    case 'DUE_NUDGE':
      if (outcome.wantsBooking) {
        await createBookingRequest(
          {
            familyId: call.familyId,
            patientId: call.patientId,
            source: 'DUE_NUDGE',
            callerPhone: call.toPhone,
            callerName: call.recipientName,
            preferredDate: outcome.bookingDate,
            windowStartHour: outcome.bookingHour,
            notes: 'Said yes to the reminder call.',
          },
          now,
        );
      }
      break;
  }

  if (outcome.wantsHuman) {
    await ticket(call, {
      category: call.kind === 'POST_VISIT_CHECKIN' ? 'VISIT_QUALITY' : call.kind === 'FASTING_PREP' ? 'VISIT_PREPARATION' : 'SCHEDULING',
      subject: `Call ${firstName(call.recipientName)} back${ref ? ` about ${ref}` : ''}: asked for a person`,
      body: outcome.humanReason ?? '',
      priority: call.kind === 'MISSED_DOOR' ? 'URGENT' : 'NORMAL',
    });
  }

  await finished(updated, outcome);
  return updated;
}

async function finished(call: VoiceCall, outcome: CallOutcome) {
  await audit({
    action: 'VOICE_CALL_FINISHED',
    entityType: 'VoiceCall',
    entityId: call.id,
    actorRole: 'SYSTEM',
    detail: { kind: call.kind, status: call.status, reached: outcome.reached },
  });
}

export function readOutcome(call: Pick<VoiceCall, 'outcomeJson'>): CallOutcome | null {
  try {
    return JSON.parse(call.outcomeJson) as CallOutcome;
  } catch {
    return null;
  }
}
