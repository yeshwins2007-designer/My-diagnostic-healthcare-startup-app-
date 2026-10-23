/**
 * When the assistant calls whom.
 *
 * Two kinds of trigger:
 *   - planned: scripts/voice-calls.ts runs every few minutes and plans the
 *     night-before fasting calls, after-visit check-ins, monthly updates and
 *     due reminders, then dials whatever is due;
 *   - events: a door nobody answers (the technician's button) and a report
 *     released by a person (the ops console) dial straight away.
 *
 * Every call is planned once (a unique key per purpose), only if the family
 * turned that kind on, and only rings inside the listener's calling hours in
 * their own time zone. Everything is re-checked at the moment of dialling:
 * a visit moved or cancelled, or a call turned off, means no call.
 */

import type { VoiceCall } from '@prisma/client';
import { db } from '../db';
import { audit } from '../compliance/audit';
import type { VoiceCallKind } from '../enums';
import { isLocale } from '../i18n/locales';
import { callsEnabled } from './consent';
import { getDialer } from './dialer';
import { callPolicy, NUDGE_DAYS_BEFORE, VISIT_EVERY_DAYS } from './kinds';
import { buildCallScript, firstName, lastMealTime, type CallContext } from './scripts';
import { addDays, INDIA, isValidTimeZone, localParts, nextCallingTime, spokenDate, withinHours, zonedInstant } from './time';

/** Visits that have happened, for check-ins, reminders and the monthly update. */
const VISITED = ['COLLECTED', 'IN_TRANSIT', 'AT_LAB', 'PROCESSING', 'REPORTED', 'CLOSED'];
const UPCOMING = ['REQUESTED', 'SCHEDULED', 'EN_ROUTE', 'ARRIVED'];
/** A door call is worth making only while the technician can still wait. */
const DOOR_CALL_STALE_MINUTES = 20;
/** No result back from the phone line in this long: treat it as unanswered. */
const DIALING_TIMEOUT_MINUTES = 30;

// --- who picks up --------------------------------------------------------------

export async function familyContact(familyId: string) {
  return db.familyMember.findFirst({
    where: { familyId, user: { isActive: true, role: 'CAREGIVER' } },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    include: { user: true },
  });
}

interface Recipient {
  role: 'PATIENT' | 'FAMILY';
  name: string;
  phone: string;
  locale: string;
  timeZone: string;
}

async function recipientFor(
  kind: VoiceCallKind,
  familyId: string,
  patient: { name: string; phone: string | null; language: string } | null,
  forceFamily = false,
): Promise<Recipient | null> {
  const contact = await familyContact(familyId);
  const familyLocale = contact?.user.locale ?? 'en';
  if (!forceFamily && callPolicy(kind).to === 'PATIENT' && patient?.phone) {
    return {
      role: 'PATIENT',
      name: patient.name,
      phone: patient.phone,
      locale: isLocale(patient.language) ? patient.language : familyLocale,
      timeZone: INDIA,
    };
  }
  if (!contact) return null;
  return {
    role: 'FAMILY',
    name: contact.user.name,
    phone: contact.user.phone,
    locale: familyLocale,
    timeZone: isValidTimeZone(contact.user.timeZone) ? contact.user.timeZone : INDIA,
  };
}

async function planCall(input: {
  kind: VoiceCallKind;
  dedupeKey: string;
  familyId: string;
  patientId?: string | null;
  bookingId?: string | null;
  recipient: Recipient;
  at: Date;
  /** Not worth making after this. */
  deadline?: Date;
}): Promise<VoiceCall | null> {
  if (!(await callsEnabled(input.familyId, input.kind))) return null;
  const policy = callPolicy(input.kind);
  const scheduledFor = nextCallingTime(input.at, input.recipient.timeZone, policy.hours);
  if (input.deadline && scheduledFor > input.deadline) return null;
  return db.voiceCall.upsert({
    where: { dedupeKey: input.dedupeKey },
    update: {},
    create: {
      kind: input.kind,
      dedupeKey: input.dedupeKey,
      familyId: input.familyId,
      patientId: input.patientId ?? null,
      bookingId: input.bookingId ?? null,
      recipientRole: input.recipient.role,
      recipientName: input.recipient.name,
      toPhone: input.recipient.phone,
      locale: input.recipient.locale,
      timeZone: input.recipient.timeZone,
      scheduledFor,
      maxAttempts: policy.maxAttempts,
    },
  });
}

// --- planned calls --------------------------------------------------------------

async function planFastingCalls(now: Date) {
  const bookings = await db.booking.findMany({
    where: {
      status: 'SCHEDULED',
      fastingRequired: true,
      windowStart: { gt: now, lt: new Date(now.getTime() + 40 * 3_600_000) },
    },
    include: { patient: true },
  });
  let planned = 0;
  for (const b of bookings) {
    const visitDay = localParts(b.windowStart, INDIA).ymd;
    const recipient = await recipientFor('FASTING_PREP', b.familyId, b.patient);
    if (!recipient) continue;
    // The evening before, and only while there is still time to eat dinner.
    const at = zonedInstant(addDays(visitDay, -1), 17, 30, INDIA);
    const call = await planCall({
      kind: 'FASTING_PREP',
      dedupeKey: `FASTING_PREP:${b.id}`,
      familyId: b.familyId,
      patientId: b.patientId,
      bookingId: b.id,
      recipient,
      at: at < now ? now : at,
      deadline: lastMealTime(b.windowStart, b.fastingHours),
    });
    if (call) planned++;
  }
  return planned;
}

async function planCheckins(now: Date) {
  const bookings = await db.booking.findMany({
    where: {
      status: { in: VISITED },
      arrivedAt: { gt: new Date(now.getTime() - 48 * 3_600_000), lt: now },
      feedback: null,
    },
    include: { patient: true },
  });
  let planned = 0;
  for (const b of bookings) {
    const recipient = await recipientFor('POST_VISIT_CHECKIN', b.familyId, b.patient);
    if (!recipient) continue;
    const at = new Date(b.arrivedAt!.getTime() + 2 * 3_600_000);
    const call = await planCall({
      kind: 'POST_VISIT_CHECKIN',
      dedupeKey: `POST_VISIT_CHECKIN:${b.id}`,
      familyId: b.familyId,
      patientId: b.patientId,
      bookingId: b.id,
      recipient,
      at: at < now ? now : at,
      deadline: new Date(b.arrivedAt!.getTime() + 48 * 3_600_000),
    });
    if (call) planned++;
  }
  return planned;
}

async function planMonthlyUpdates(now: Date) {
  const families = await db.callPreference.findMany({ where: { kind: 'MONTHLY_UPDATE', enabled: true } });
  let planned = 0;
  for (const { familyId } of families) {
    if ((await db.booking.count({ where: { familyId, status: { in: VISITED } } })) === 0) continue;
    const recipient = await recipientFor('MONTHLY_UPDATE', familyId, null);
    if (!recipient) continue;
    // The first of each month at half past six, the listener's own evening.
    const p = localParts(now, recipient.timeZone);
    const monthStart = `${p.ymd.slice(0, 7)}-01`;
    const at = zonedInstant(monthStart, 18, 30, recipient.timeZone);
    if (now < new Date(at.getTime() - 24 * 3_600_000) || now > new Date(at.getTime() + 3 * 86_400_000)) continue;
    const call = await planCall({
      kind: 'MONTHLY_UPDATE',
      dedupeKey: `MONTHLY_UPDATE:${familyId}:${monthStart.slice(0, 7)}`,
      familyId,
      recipient,
      at: at < now ? now : at,
    });
    if (call) planned++;
  }
  return planned;
}

async function planDueNudges(now: Date) {
  const families = await db.callPreference.findMany({ where: { kind: 'DUE_NUDGE', enabled: true } });
  let planned = 0;
  for (const { familyId } of families) {
    const patients = await db.patient.findMany({ where: { familyId, isActive: true } });
    for (const patient of patients) {
      const last = await db.booking.findFirst({
        where: { patientId: patient.id, status: { in: VISITED } },
        orderBy: { windowStart: 'desc' },
      });
      if (!last) continue;
      const due = new Date(last.windowStart.getTime() + VISIT_EVERY_DAYS * 86_400_000);
      const at = new Date(due.getTime() - NUDGE_DAYS_BEFORE * 86_400_000);
      if (now < new Date(at.getTime() - 86_400_000) || now >= due) continue;
      const booked = await db.booking.count({
        where: { patientId: patient.id, status: { in: UPCOMING }, windowStart: { gt: now } },
      });
      const asked = await db.voiceBookingRequest.count({ where: { patientId: patient.id, status: 'NEW' } });
      if (booked > 0 || asked > 0) continue;
      const recipient = await recipientFor('DUE_NUDGE', familyId, patient);
      if (!recipient) continue;
      const call = await planCall({
        kind: 'DUE_NUDGE',
        dedupeKey: `DUE_NUDGE:${patient.id}:${localParts(due, INDIA).ymd}`,
        familyId,
        patientId: patient.id,
        bookingId: last.id,
        recipient,
        at: at < now ? now : at,
        deadline: due,
      });
      if (call) planned++;
    }
  }
  return planned;
}

export async function planCalls(now = new Date()) {
  const counts = {
    fasting: await planFastingCalls(now),
    checkins: await planCheckins(now),
    monthly: await planMonthlyUpdates(now),
    nudges: await planDueNudges(now),
  };
  return counts;
}

// --- events ---------------------------------------------------------------------

/** The technician pressed "No one is answering". Calls the parent now; the family follows if they don't pick up. */
export async function onDoorNotAnswered(bookingId: string, now = new Date()) {
  const booking = await db.booking.findUnique({ where: { id: bookingId }, include: { patient: true } });
  if (!booking) return null;
  const toFamilyFirst = !booking.patient.phone;
  const recipient = await recipientFor('MISSED_DOOR', booking.familyId, booking.patient, toFamilyFirst);
  if (!recipient) return null;
  const call = await planCall({
    kind: 'MISSED_DOOR',
    dedupeKey: `MISSED_DOOR:${booking.id}:${recipient.role}`,
    familyId: booking.familyId,
    patientId: booking.patientId,
    bookingId: booking.id,
    recipient,
    at: now,
  });
  if (call && call.status === 'SCHEDULED') return dialCall(call.id, now);
  return call;
}

/** The parent did not pick up the door call: try the family, straight away. */
export async function escalateDoorToFamily(call: VoiceCall, now = new Date()) {
  if (call.kind !== 'MISSED_DOOR' || call.recipientRole !== 'PATIENT' || !call.bookingId) return null;
  const booking = await db.booking.findUnique({ where: { id: call.bookingId }, include: { patient: true } });
  if (!booking) return null;
  const recipient = await recipientFor('MISSED_DOOR', booking.familyId, booking.patient, true);
  if (!recipient) return null;
  const next = await planCall({
    kind: 'MISSED_DOOR',
    dedupeKey: `MISSED_DOOR:${booking.id}:FAMILY`,
    familyId: booking.familyId,
    patientId: booking.patientId,
    bookingId: booking.id,
    recipient,
    at: now,
  });
  if (next && next.status === 'SCHEDULED') return dialCall(next.id, now);
  return next;
}

/**
 * A person released a report. The family hears it is ready; they never hear
 * what is in it, and when a value is critical a person calls first, under
 * the critical-value protocol, so the assistant stays out of it.
 */
export async function onReportReleased(reportId: string, now = new Date()) {
  const report = await db.report.findUnique({
    where: { id: reportId },
    include: { booking: { include: { patient: true } }, criticals: true },
  });
  if (!report || report.status !== 'RELEASED' || report.criticals.length > 0) return null;
  const recipient = await recipientFor('REPORT_READY', report.booking.familyId, report.booking.patient);
  if (!recipient) return null;
  const call = await planCall({
    kind: 'REPORT_READY',
    dedupeKey: `REPORT_READY:${report.id}`,
    familyId: report.booking.familyId,
    patientId: report.patientId,
    bookingId: report.bookingId,
    recipient,
    at: now,
  });
  if (call && call.status === 'SCHEDULED' && call.scheduledFor <= now) return dialCall(call.id, now);
  return call;
}

// --- dialling -------------------------------------------------------------------

/** Everything the brief needs, read fresh at the moment of the call. Null: don't call. */
async function contextFor(call: VoiceCall, now: Date): Promise<{ ctx: CallContext } | { skip: string }> {
  const booking = call.bookingId
    ? await db.booking.findUnique({
        where: { id: call.bookingId },
        include: { patient: true, technician: { include: { user: true } } },
      })
    : null;
  const patient = booking?.patient ?? (call.patientId ? await db.patient.findUnique({ where: { id: call.patientId } }) : null);
  const base = {
    kind: call.kind as VoiceCallKind,
    recipientRole: call.recipientRole as 'PATIENT' | 'FAMILY',
    recipientName: call.recipientName,
    locale: call.locale,
    timeZone: call.timeZone,
    patientName: patient?.name ?? '',
    technicianName: booking?.technician?.user.name,
  };

  switch (call.kind) {
    case 'FASTING_PREP': {
      if (!booking || booking.status !== 'SCHEDULED' || !booking.fastingRequired) return { skip: 'The visit is no longer scheduled.' };
      if (now > lastMealTime(booking.windowStart, booking.fastingHours)) return { skip: 'Too late in the evening to help with fasting.' };
      return { ctx: { ...base, visit: booking } };
    }
    case 'MISSED_DOOR': {
      if (!booking || !['ARRIVED', 'EN_ROUTE', 'SCHEDULED'].includes(booking.status)) return { skip: 'The visit has moved on.' };
      if (now.getTime() - call.scheduledFor.getTime() > DOOR_CALL_STALE_MINUTES * 60_000) return { skip: 'The technician could no longer wait.' };
      return { ctx: { ...base, visit: booking } };
    }
    case 'POST_VISIT_CHECKIN': {
      if (!booking || !VISITED.includes(booking.status)) return { skip: 'The visit did not happen.' };
      if (await db.visitFeedback.findUnique({ where: { bookingId: booking.id } })) return { skip: 'They already told us how it went.' };
      return { ctx: { ...base, visit: booking } };
    }
    case 'REPORT_READY': {
      if (!booking) return { skip: 'The visit is gone.' };
      return { ctx: { ...base, reportVisitDate: booking.windowStart } };
    }
    case 'MONTHLY_UPDATE': {
      const facts = await monthlyFacts(call.familyId, now);
      if (facts.patientNames.length === 0) return { skip: 'Nothing to report this month.' };
      return { ctx: { ...base, patientName: facts.patientNames.join(' and '), monthlyFacts: facts.lines } };
    }
    case 'DUE_NUDGE': {
      if (!booking || !patient) return { skip: 'No earlier visit to go by.' };
      const booked = await db.booking.count({ where: { patientId: patient.id, status: { in: UPCOMING }, windowStart: { gt: now } } });
      if (booked > 0) return { skip: 'The next visit is already booked.' };
      const due = new Date(booking.windowStart.getTime() + VISIT_EVERY_DAYS * 86_400_000);
      // The usual slot: the same weekday and window as last time, on or after the due date.
      let proposed = new Date(due);
      while (localParts(proposed, INDIA).weekday !== localParts(booking.windowStart, INDIA).weekday) {
        proposed = new Date(proposed.getTime() + 86_400_000);
      }
      const lp = localParts(booking.windowStart, INDIA);
      proposed = zonedInstant(localParts(proposed, INDIA).ymd, lp.hour, lp.minute, INDIA);
      const proposedWindowEnd = new Date(proposed.getTime() + (booking.windowEnd.getTime() - booking.windowStart.getTime()));
      return { ctx: { ...base, due: { dueDate: due, lastVisit: booking.windowStart, proposed, proposedWindowEnd } } };
    }
  }
  return { skip: 'Unknown call.' };
}

/** The plain facts of the month, per parent. Operational only, never clinical. */
export async function monthlyFacts(familyId: string, now: Date) {
  const since = new Date(now.getTime() - 31 * 86_400_000);
  const patients = await db.patient.findMany({ where: { familyId, isActive: true } });
  const lines: string[] = [];
  const patientNames: string[] = [];
  for (const p of patients) {
    const done = await db.booking.findMany({
      where: { patientId: p.id, status: { in: VISITED }, windowStart: { gte: since, lt: now } },
      orderBy: { windowStart: 'asc' },
    });
    const next = await db.booking.findFirst({
      where: { patientId: p.id, status: { in: UPCOMING }, windowStart: { gt: now } },
      orderBy: { windowStart: 'asc' },
    });
    if (done.length === 0 && !next) continue;
    const name = firstName(p.name);
    patientNames.push(name);
    lines.push(
      done.length === 0
        ? `${name} had no visit in the last month.`
        : `${name} had ${done.length === 1 ? 'one visit' : `${done.length} visits`}: ${done.map((b) => spokenDate(b.windowStart, INDIA)).join(', ')}.`,
    );
    const released = await db.report.count({ where: { patientId: p.id, status: 'RELEASED', releasedAt: { gte: since } } });
    if (released > 0) lines.push(`${released === 1 ? 'One report was' : `${released} reports were`} released to the app, and a coordinator called about ${released === 1 ? 'it' : 'them'}.`);
    lines.push(next ? `${name}'s next visit is on ${spokenDate(next.windowStart, INDIA)}.` : `${name} has no visit booked yet.`);
  }
  const open = await db.supportTicket.count({ where: { familyId, status: { in: ['OPEN', 'IN_PROGRESS'] } } });
  if (open > 0) lines.push(`Our coordinators have ${open === 1 ? 'one open item' : `${open} open items`} for the family and will call about ${open === 1 ? 'it' : 'them'}.`);
  return { lines, patientNames };
}

/** Make one call now, if it should still be made. */
export async function dialCall(callId: string, now = new Date()): Promise<VoiceCall | null> {
  const call = await db.voiceCall.findUnique({ where: { id: callId } });
  if (!call || call.status !== 'SCHEDULED') return call;
  const policy = callPolicy(call.kind as VoiceCallKind);

  if (!(await callsEnabled(call.familyId, call.kind as VoiceCallKind))) {
    return db.voiceCall.update({ where: { id: call.id }, data: { status: 'CANCELLED', statusReason: 'The family turned this call off.' } });
  }
  if (!withinHours(now, call.timeZone, policy.hours)) {
    return db.voiceCall.update({ where: { id: call.id }, data: { scheduledFor: nextCallingTime(now, call.timeZone, policy.hours) } });
  }
  const prepared = await contextFor(call, now);
  if ('skip' in prepared) {
    return db.voiceCall.update({ where: { id: call.id }, data: { status: 'CANCELLED', statusReason: prepared.skip } });
  }

  const script = buildCallScript(prepared.ctx);
  const result = await getDialer()({
    callId: call.id,
    toPhone: call.toPhone,
    dynamicVariables: {
      voice_call_id: call.id,
      call_kind: call.kind,
      greeting: script.greeting,
      recipient_name: firstName(call.recipientName),
      patient_name: firstName(prepared.ctx.patientName),
      language_name: script.languageName,
      call_brief: script.brief,
    },
  });
  const attempts = call.attempts + 1;

  let updated: VoiceCall;
  if (result.ok && result.simulated) {
    updated = await db.voiceCall.update({
      where: { id: call.id },
      data: {
        status: 'SIMULATED',
        attempts,
        lastAttemptAt: now,
        completedAt: now,
        summary: `${script.headline}. No phone line is set up, so nothing was dialled. It would have said:\n${script.brief}`,
      },
    });
  } else if (result.ok) {
    updated = await db.voiceCall.update({
      where: { id: call.id },
      data: { status: 'DIALING', attempts, lastAttemptAt: now, providerCallId: result.providerCallId, summary: script.headline },
    });
  } else {
    const retry = attempts < call.maxAttempts;
    updated = await db.voiceCall.update({
      where: { id: call.id },
      data: retry
        ? { attempts, lastAttemptAt: now, scheduledFor: new Date(now.getTime() + Math.max(5, policy.retryAfterMinutes) * 60_000), statusReason: result.error }
        : { status: 'FAILED', attempts, lastAttemptAt: now, statusReason: result.error },
    });
  }

  await audit({
    action: 'VOICE_CALL_PLACED',
    entityType: 'VoiceCall',
    entityId: call.id,
    actorRole: 'SYSTEM',
    detail: { kind: call.kind, to: call.recipientRole, status: updated.status, attempt: attempts },
  });
  return updated;
}

export async function dialDueCalls(now = new Date()) {
  const due = await db.voiceCall.findMany({
    where: { status: 'SCHEDULED', scheduledFor: { lte: now } },
    orderBy: { scheduledFor: 'asc' },
    take: 50,
  });
  let dialled = 0;
  for (const call of due) {
    const after = await dialCall(call.id, now);
    if (after && after.status !== 'SCHEDULED' && after.status !== 'CANCELLED') dialled++;
  }
  return dialled;
}

/** A call that never reported back counts as unanswered. Imported lazily to keep outcomes after scheduling. */
export async function sweepSilentCalls(now = new Date()) {
  const { recordCallResult } = await import('./outcomes');
  const stale = await db.voiceCall.findMany({
    where: { status: 'DIALING', lastAttemptAt: { lt: new Date(now.getTime() - DIALING_TIMEOUT_MINUTES * 60_000) } },
  });
  for (const call of stale) {
    await recordCallResult({ callId: call.id, answered: false, failureReason: 'no result from the phone line' }, now);
  }
  return stale.length;
}
