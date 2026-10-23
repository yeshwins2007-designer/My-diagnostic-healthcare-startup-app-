/**
 * What the assistant answers when someone calls us, or asks in the app.
 *
 * One set of answers for both: the phone agent reaches them through
 * app/api/voice/tool/[name], the in-app assistant through /api/voice/turn.
 * Every answer is built from the family's own records and says nothing
 * clinical: no tool here can read a result, by design (see
 * lib/providers/voice/tools.ts).
 *
 * Callers are known by the number they call from (a parent's phone, or a
 * family member's), or in the app by their session. Someone we don't know
 * can still ask for a visit: that becomes a callback from a person.
 */

import { createHmac } from 'node:crypto';
import { db } from '../db';
import { env } from '../env';
import { brand } from '../brand';
import { safeEqual } from '../compliance/crypto';
import { describeEta, technicianEta } from './eta';
import { createBookingRequest, describeRequestedSlot } from './requests';
import { firstName, lastMealTime } from './scripts';
import { INDIA, spokenDate, spokenTime } from './time';

export interface Caller {
  userId: string | null;
  familyId: string | null;
  /** Set when the caller is the parent themselves. */
  patientId: string | null;
  phone: string;
  name: string;
}

const UPCOMING = ['REQUESTED', 'SCHEDULED', 'EN_ROUTE', 'ARRIVED'];

const toE164 = (raw: string) => {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  return digits ? `+${digits}` : '';
};

/** Who is calling, from the number they call from. */
export async function callerFromPhone(raw: string): Promise<Caller> {
  const phone = toE164(raw);
  const unknown: Caller = { userId: null, familyId: null, patientId: null, phone, name: '' };
  if (!phone) return unknown;
  const user = await db.user.findFirst({ where: { phone, isActive: true, role: 'CAREGIVER' }, include: { families: true } });
  if (user?.families[0]) return { userId: user.id, familyId: user.families[0].familyId, patientId: null, phone, name: user.name };
  const patient = await db.patient.findFirst({ where: { phone, isActive: true } });
  if (patient) return { userId: null, familyId: patient.familyId, patientId: patient.id, phone, name: patient.name };
  return unknown;
}

export async function callerFromUser(userId: string): Promise<Caller | null> {
  const user = await db.user.findUnique({ where: { id: userId }, include: { families: true } });
  if (!user || !user.isActive) return null;
  return { userId: user.id, familyId: user.families[0]?.familyId ?? null, patientId: null, phone: user.phone, name: user.name };
}

// --- the in-app session, handed to the agent so its tools know who is asking ---

const SESSION_TTL_SECONDS = 2 * 3600;

export function signCallerSession(userId: string, nowMs = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS;
  const mac = createHmac('sha256', env.AUTH_SECRET).update(`caller:${userId}.${exp}`).digest('hex');
  return `${userId}.${exp}.${mac}`;
}

export function verifyCallerSession(token: string, nowMs = Date.now()): string | null {
  const [userId, exp, mac] = token.split('.');
  if (!userId || !exp || !mac || Number(exp) * 1000 < nowMs) return null;
  const expected = createHmac('sha256', env.AUTH_SECRET).update(`caller:${userId}.${exp}`).digest('hex');
  return safeEqual(mac, expected) ? userId : null;
}

// --- answers --------------------------------------------------------------------

async function patientsFor(caller: Caller, name?: string) {
  if (!caller.familyId) return [];
  if (caller.patientId) return db.patient.findMany({ where: { id: caller.patientId } });
  const all = await db.patient.findMany({ where: { familyId: caller.familyId, isActive: true } });
  const wanted = name?.trim().toLowerCase();
  const match = wanted ? all.filter((p) => p.name.toLowerCase().includes(wanted) || wanted.includes(firstName(p.name).toLowerCase())) : [];
  return match.length > 0 ? match : all;
}

const NOT_KNOWN = `I can't find your number with us. A coordinator can help: I'll ask one to call you back, or you can call ${brand.supportPhone}.`;

export async function nextVisitAnswer(caller: Caller, patientName?: string, now = new Date()): Promise<string> {
  const patients = await patientsFor(caller, patientName);
  if (patients.length === 0) return NOT_KNOWN;
  const lines: string[] = [];
  for (const p of patients) {
    const b = await db.booking.findFirst({
      where: { patientId: p.id, status: { in: UPCOMING }, windowEnd: { gt: now } },
      orderBy: { windowStart: 'asc' },
      include: { technician: { include: { user: true } } },
    });
    lines.push(
      b
        ? `${firstName(p.name)}'s next visit is on ${spokenDate(b.windowStart, INDIA)}, between ${spokenTime(b.windowStart, INDIA)} and ${spokenTime(b.windowEnd, INDIA)}.${b.technician ? ` ${firstName(b.technician.user.name)} will come.` : ''}${b.fastingRequired ? ` It needs ${b.fastingHours} hours of fasting.` : ''}`
        : `${firstName(p.name)} has no visit booked. I can note one for you to confirm in the app.`,
    );
  }
  return lines.join(' ');
}

export async function etaAnswer(caller: Caller, now = new Date()): Promise<string> {
  const patients = await patientsFor(caller);
  if (patients.length === 0) return NOT_KNOWN;
  const today = now.toLocaleDateString('en-CA', { timeZone: INDIA });
  const lines: string[] = [];
  for (const p of patients) {
    const b = await db.booking.findFirst({
      where: { patientId: p.id, status: { in: ['SCHEDULED', 'EN_ROUTE', 'ARRIVED'] } },
      orderBy: { windowStart: 'asc' },
    });
    if (!b || b.windowStart.toLocaleDateString('en-CA', { timeZone: INDIA }) !== today) continue;
    const e = await technicianEta(b.id, now);
    if (e) lines.push(patients.length > 1 ? `For ${firstName(p.name)}: ${describeEta(e)}` : describeEta(e));
  }
  return lines.length > 0 ? lines.join(' ') : 'There is no visit today. ' + (await nextVisitAnswer(caller, undefined, now));
}

/** The fasting rule for the next visit. Medicines are a person's question, never ours. */
export async function fastingAnswer(caller: Caller, now = new Date()): Promise<string> {
  const patients = await patientsFor(caller);
  if (patients.length === 0) return NOT_KNOWN;
  const b = await db.booking.findFirst({
    where: { patientId: { in: patients.map((p) => p.id) }, status: { in: UPCOMING }, windowEnd: { gt: now } },
    orderBy: { windowStart: 'asc' },
    include: { patient: true },
  });
  if (!b) return 'There is no visit booked, so there is nothing to fast for yet.';
  if (!b.fastingRequired) return `${firstName(b.patient.name)}'s visit on ${spokenDate(b.windowStart, INDIA)} needs no fasting. Eat and drink as usual.`;
  const meal = lastMealTime(b.windowStart, b.fastingHours);
  return `For the visit on ${spokenDate(b.windowStart, INDIA)} at ${spokenTime(b.windowStart, INDIA)}, the test needs ${b.fastingHours} hours without food. Please have the last meal by ${spokenTime(meal, INDIA)} the evening before, and nothing to eat after that until the sample is taken. Plain water is fine. For any question about medicines, a coordinator will call you.`;
}

export async function reportStatusAnswer(caller: Caller): Promise<string> {
  const patients = await patientsFor(caller);
  if (patients.length === 0) return NOT_KNOWN;
  const report = await db.report.findFirst({
    where: { patientId: { in: patients.map((p) => p.id) } },
    orderBy: { createdAt: 'desc' },
    include: { patient: true },
  });
  if (!report) return 'There is no report yet. It comes after the first visit.';
  const who = firstName(report.patient.name);
  if (report.status === 'RELEASED' && report.releasedAt) {
    return `${who}'s latest report was released on ${spokenDate(report.releasedAt, INDIA)}. It's in the app under Reports, and a coordinator calls within 24 hours of every report to go through it.`;
  }
  return `${who}'s report is with the laboratory. It reaches the app once their pathologist has signed it and our coordinator has checked it.`;
}

export async function requestVisitAnswer(
  caller: Caller,
  args: { patient_name?: string; preferred_date?: string; preferred_window_hour?: number; tests?: string; address_change?: string; notes?: string },
): Promise<string> {
  const patients = await patientsFor(caller, args.patient_name);
  const patient = patients.length === 1 ? patients[0] : patients.find((p) => p.id === caller.patientId) ?? null;
  const request = await createBookingRequest({
    familyId: caller.familyId,
    patientId: patient?.id ?? null,
    source: 'INBOUND_CALL',
    callerPhone: caller.phone,
    callerName: caller.name || args.patient_name || '',
    preferredDate: args.preferred_date,
    windowStartHour: args.preferred_window_hour,
    testsRequested: args.tests,
    addressNote: args.address_change,
    notes: args.notes,
  });
  const slot = describeRequestedSlot(request.preferredDate, request.windowStartHour);
  if (!caller.familyId) {
    return `Thank you. I've noted a visit for ${slot}. A coordinator will call you back to set it up, from ${brand.supportPhone}.`;
  }
  return caller.patientId
    ? `Thank you, I've noted a visit for ${slot}. Your family will confirm it in the app, and we'll call you the evening before.`
    : `I've noted a visit for ${slot}. Please confirm it in the app, where you choose the tests and pay. We hold it for two days.`;
}

export async function planAnswer(caller: Caller): Promise<string> {
  if (!caller.familyId) return NOT_KNOWN;
  const sub = await db.subscription.findFirst({
    where: { familyId: caller.familyId, status: 'ACTIVE' },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
  });
  return sub
    ? `You're a ${sub.plan.name} member: a discount on every test and no home-collection charge. You can cancel it any time in the app.`
    : 'You pay per test, plus a home-collection charge for each visit. Medwyn One, our optional membership, takes money off every test and removes the collection charge.';
}

export async function callbackAnswer(caller: Caller, reason: string, urgency: 'NORMAL' | 'HIGH' | 'URGENT', category = 'CLINICAL_HANDOFF'): Promise<string> {
  await db.supportTicket.create({
    data: {
      familyId: caller.familyId,
      raisedByUserId: caller.userId,
      source: 'VOICE_AGENT',
      category,
      subject: `${urgency === 'URGENT' ? 'URGENT: ' : ''}Call back ${caller.name || caller.phone || 'the caller'}`.slice(0, 160),
      body: reason.slice(0, 2000),
      priority: urgency,
    },
  });
  return urgency === 'URGENT'
    ? 'I have asked a coordinator to call you straight away.'
    : 'I have asked a coordinator to call you back today.';
}
