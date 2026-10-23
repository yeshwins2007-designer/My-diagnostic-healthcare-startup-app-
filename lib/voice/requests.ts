/**
 * Visits asked for by phone.
 *
 * A parent who just calls and talks, or a family saying yes to "shall I hold
 * the usual slot?", leaves a request, not a booking. The family confirms it
 * in the app, where they choose the tests and pay: nothing is spent on a
 * phone call, a misheard date costs a tap rather than a wasted trip, and
 * Elder Mode keeps its promise that a parent can never spend money by
 * accident. A caller we do not recognise becomes a callback for a person.
 */

import { db } from '../db';
import { audit } from '../compliance/audit';
import { env } from '../env';
import { getSmsProvider } from '../providers/sms';
import { REQUEST_HOLD_HOURS } from './kinds';
import { firstName } from './scripts';
import { INDIA, zonedInstant } from './time';

export interface BookingRequestInput {
  familyId?: string | null;
  patientId?: string | null;
  source: 'INBOUND_CALL' | 'DUE_NUDGE' | 'IN_APP';
  callerPhone?: string;
  callerName?: string;
  preferredDate?: string;
  windowStartHour?: number | null;
  testsRequested?: string;
  addressNote?: string;
  notes?: string;
}

export function describeRequestedSlot(date: string, hour: number | null | undefined): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'a day to be agreed';
  const at = zonedInstant(date, hour ?? 7, 30, INDIA);
  const day = at.toLocaleDateString('en-IN', { timeZone: INDIA, weekday: 'long', day: 'numeric', month: 'long' });
  return hour ? `${day}, ${hour}:30 to ${hour + 1}:30 am` : day;
}

export async function createBookingRequest(input: BookingRequestInput, now = new Date()) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.preferredDate ?? '') ? input.preferredDate! : '';
  const hour = input.windowStartHour && input.windowStartHour >= 6 && input.windowStartHour <= 10 ? input.windowStartHour : null;

  // Asked twice for the same day (a parent who calls back to check): one request.
  if (input.patientId) {
    const same = await db.voiceBookingRequest.findFirst({
      where: { patientId: input.patientId, status: 'NEW', preferredDate: date },
    });
    if (same) return same;
  }

  const request = await db.voiceBookingRequest.create({
    data: {
      familyId: input.familyId ?? null,
      patientId: input.patientId ?? null,
      source: input.source,
      callerPhone: input.callerPhone ?? '',
      callerName: input.callerName?.slice(0, 120) ?? '',
      preferredDate: date,
      windowStartHour: hour,
      testsRequested: input.testsRequested?.slice(0, 500) ?? '',
      addressNote: input.addressNote?.slice(0, 500) ?? '',
      notes: input.notes?.slice(0, 1000) ?? '',
      expiresAt: new Date(now.getTime() + REQUEST_HOLD_HOURS * 3_600_000),
    },
    include: { patient: true },
  });

  await audit({
    action: 'VOICE_BOOKING_REQUESTED',
    entityType: 'VoiceBookingRequest',
    entityId: request.id,
    actorRole: 'SYSTEM',
    detail: { source: input.source, known: Boolean(input.familyId) },
  });

  if (!input.familyId) {
    // Someone we don't know yet: a person calls them back to sign them up.
    await db.supportTicket.create({
      data: {
        source: 'VOICE_AGENT',
        category: 'VOICE_BOOKING',
        subject: `New caller asked for a home visit: call back ${input.callerPhone || 'the number on the request'}`,
        body: [input.callerName, describeRequestedSlot(date, hour), input.testsRequested, input.addressNote, input.notes]
          .filter(Boolean)
          .join('\n'),
        priority: 'HIGH',
      },
    });
    return request;
  }

  // Tell the family, where they will see it: a message with the way to confirm.
  const contact = await db.familyMember.findFirst({
    where: { familyId: input.familyId, user: { isActive: true } },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    include: { user: true },
  });
  if (contact) {
    const who = request.patient ? firstName(request.patient.name) : 'Your parent';
    const asked = input.source === 'DUE_NUDGE' ? 'You asked us to hold' : `${who} called and asked for`;
    const link = env.PUBLIC_APP_URL ? ` ${env.PUBLIC_APP_URL.replace(/\/$/, '')}/caregiver` : '';
    await getSmsProvider()
      .sendWhatsApp(
        contact.user.phone,
        `${asked} a home visit on ${describeRequestedSlot(date, hour)}. Confirm it in the MEDWYN app to choose the tests and pay. We hold it for ${REQUEST_HOLD_HOURS / 24} days.${link}`,
      )
      .catch(() => null);
  }
  return request;
}

/** Requests nobody confirmed lapse, so a held slot never blocks anyone forever. */
export async function expireBookingRequests(now = new Date()) {
  const { count } = await db.voiceBookingRequest.updateMany({
    where: { status: 'NEW', expiresAt: { lt: now }, familyId: { not: null } },
    data: { status: 'EXPIRED' },
  });
  return count;
}
