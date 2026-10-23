/**
 * The assistant's calls, against a real (throwaway) database: only what the
 * family turned on, only in the listener's calling hours, never twice, and
 * every result turned into the right next step.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const DB_FILE = path.resolve(import.meta.dirname, '../prisma/voice-calls-test.db');
process.env.DATABASE_URL = `file:${DB_FILE}`;

let db: typeof import('@/lib/db').db;
let scheduler: typeof import('@/lib/voice/scheduler');
let outcomes: typeof import('@/lib/voice/outcomes');
let consent: typeof import('@/lib/voice/consent');
let dialer: typeof import('@/lib/voice/dialer');
let time: typeof import('@/lib/voice/time');
let eta: typeof import('@/lib/voice/eta');

beforeAll(async () => {
  fs.rmSync(DB_FILE, { force: true });
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    env: { ...process.env, DATABASE_URL: `file:${DB_FILE}` },
    stdio: 'ignore',
  });
  ({ db } = await import('@/lib/db'));
  scheduler = await import('@/lib/voice/scheduler');
  outcomes = await import('@/lib/voice/outcomes');
  consent = await import('@/lib/voice/consent');
  dialer = await import('@/lib/voice/dialer');
  time = await import('@/lib/voice/time');
  eta = await import('@/lib/voice/eta');
}, 60_000);

afterEach(() => dialer.setDialerForTests(null));

afterAll(async () => {
  await db?.$disconnect();
  fs.rmSync(DB_FILE, { force: true });
});

const IST = 'Asia/Kolkata';
const at = (ymd: string, h: number, m = 0, tz = IST) => time.zonedInstant(ymd, h, m, tz);

/** A phone line that answers with a fresh id and remembers who it rang. */
function fakeLine() {
  const rang: { to: string; vars: Record<string, string> }[] = [];
  dialer.setDialerForTests(async (input) => {
    rang.push({ to: input.toPhone, vars: input.dynamicVariables });
    return { ok: true, simulated: false, providerCallId: `conv_${Math.random().toString(36).slice(2)}` };
  });
  return rang;
}

let n = 0;
async function family(opts: { tz?: string; patientPhone?: string | null; language?: string; calls?: string[] } = {}) {
  n += 1;
  const user = await db.user.create({
    data: { phone: `+9197100${String(n).padStart(5, '0')}`, name: `Anjali ${n}`, role: 'CAREGIVER', locale: 'en', timeZone: opts.tz ?? IST },
  });
  const fam = await db.family.create({ data: { name: `F${n}`, members: { create: [{ userId: user.id }] } } });
  const patient = await db.patient.create({
    data: {
      familyId: fam.id,
      name: `Lakshmi Iyer`,
      ageYears: 79,
      sex: 'FEMALE',
      ageBand: 'BAND_70_80',
      phone: opts.patientPhone === undefined ? `+9198100${String(n).padStart(5, '0')}` : opts.patientPhone,
      language: opts.language ?? 'ta',
    },
  });
  const address = await db.patientAddress.create({
    data: { patientId: patient.id, line1: '14 Main', city: 'Bengaluru', state: 'Karnataka', pincode: '560011', latitude: 12.93, longitude: 77.58 },
  });
  const techUser = await db.user.create({ data: { phone: `+9196100${String(n).padStart(5, '0')}`, name: 'Priya Nair', role: 'TECHNICIAN' } });
  const technician = await db.technician.create({ data: { userId: techUser.id, qualification: 'DMLT' } });
  if (opts.calls) {
    await consent.setCallPreferences({
      familyId: fam.id,
      userId: user.id,
      parentName: 'Lakshmi',
      choices: Object.fromEntries(opts.calls.map((k) => [k, true])),
    });
  }
  return { user, fam, patient, address, technician };
}

async function booking(f: Awaited<ReturnType<typeof family>>, data: Partial<{ status: string; windowStart: Date; fastingHours: number; arrivedAt: Date; routeId: string }>) {
  n += 1;
  const windowStart = data.windowStart ?? at('2026-11-10', 7, 30);
  return db.booking.create({
    data: {
      reference: `SS-V${String(n).padStart(5, '0')}`,
      familyId: f.fam.id,
      patientId: f.patient.id,
      addressId: f.address.id,
      technicianId: f.technician.id,
      status: data.status ?? 'SCHEDULED',
      windowStart,
      windowEnd: new Date(windowStart.getTime() + 3_600_000),
      fastingRequired: (data.fastingHours ?? 0) > 0,
      fastingHours: data.fastingHours ?? 0,
      arrivedAt: data.arrivedAt ?? null,
      routeId: data.routeId ?? null,
    },
  });
}

describe('time zones', () => {
  it('turns a local wall-clock time into the right instant, summer time included', () => {
    expect(at('2026-11-09', 17, 30).toISOString()).toBe('2026-11-09T12:00:00.000Z');
    expect(at('2026-07-01', 18, 30, 'Europe/London').toISOString()).toBe('2026-07-01T17:30:00.000Z');
    expect(at('2026-12-01', 18, 30, 'Europe/London').toISOString()).toBe('2026-12-01T18:30:00.000Z');
  });

  it('holds a call outside calling hours until they open, in the listener’s zone', () => {
    const hours = { from: 8 * 60 + 30, to: 21 * 60 };
    const threeAmLondon = at('2026-11-12', 3, 0, 'Europe/London');
    expect(time.nextCallingTime(threeAmLondon, 'Europe/London', hours).toISOString()).toBe(at('2026-11-12', 8, 30, 'Europe/London').toISOString());
    const lateNight = at('2026-11-12', 22, 0, IST);
    expect(time.nextCallingTime(lateNight, IST, hours).toISOString()).toBe(at('2026-11-13', 8, 30).toISOString());
  });
});

describe('the night-before fasting call', () => {
  it('is never planned without the family’s consent', async () => {
    const f = await family();
    await booking(f, { fastingHours: 10 });
    await scheduler.planCalls(at('2026-11-09', 10));
    expect(await db.voiceCall.count({ where: { familyId: f.fam.id } })).toBe(0);
  });

  it('rings the parent at half past five the evening before, in their language, once', async () => {
    const f = await family({ calls: ['FASTING_PREP'] });
    const b = await booking(f, { fastingHours: 10 });
    await scheduler.planCalls(at('2026-11-09', 10));
    await scheduler.planCalls(at('2026-11-09', 11));
    const calls = await db.voiceCall.findMany({ where: { familyId: f.fam.id } });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ kind: 'FASTING_PREP', recipientRole: 'PATIENT', toPhone: f.patient.phone, locale: 'ta', bookingId: b.id });
    expect(calls[0].scheduledFor.toISOString()).toBe(at('2026-11-09', 17, 30).toISOString());

    // Not before it is due.
    const rang = fakeLine();
    await scheduler.dialDueCalls(at('2026-11-09', 16));
    expect(rang).toHaveLength(0);

    await scheduler.dialDueCalls(at('2026-11-09', 17, 35));
    expect(rang).toHaveLength(1);
    expect(rang[0].vars).toMatchObject({ greeting: 'Vanakkam, Lakshmi?', language_name: 'Tamil', call_kind: 'FASTING_PREP' });
    // The last meal: ten hours before half past seven, to the half hour.
    expect(rang[0].vars.call_brief).toContain('9:30 pm');
    expect(rang[0].vars.call_brief).not.toMatch(/result|value|normal/i);
  });

  it('asks a person to call when the parent could not repeat it back, or asked about medicines', async () => {
    const f = await family({ calls: ['FASTING_PREP'] });
    await booking(f, { fastingHours: 10 });
    await scheduler.planCalls(at('2026-11-09', 10));
    fakeLine();
    await scheduler.dialDueCalls(at('2026-11-09', 17, 40));
    const call = await db.voiceCall.findFirstOrThrow({ where: { familyId: f.fam.id } });
    expect(call.status).toBe('DIALING');

    await outcomes.recordCallResult({
      providerCallId: call.providerCallId!,
      answered: true,
      data: { reached_person: { value: true }, fasting_understood: { value: 'no' }, medicine_question: { value: true } },
    });
    expect((await db.voiceCall.findUniqueOrThrow({ where: { id: call.id } })).status).toBe('COMPLETED');
    const tickets = await db.supportTicket.findMany({ where: { familyId: f.fam.id, category: 'VISIT_PREPARATION' } });
    expect(tickets.map((t) => t.priority)).toEqual(['HIGH', 'HIGH']);

    // A replayed result changes nothing.
    await outcomes.recordCallResult({ providerCallId: call.providerCallId!, answered: true, data: { fasting_understood: 'no' } });
    expect(await db.supportTicket.count({ where: { familyId: f.fam.id } })).toBe(2);
  });

  it('tries again after no answer, then hands it to a person', async () => {
    const f = await family({ calls: ['FASTING_PREP'] });
    await booking(f, { fastingHours: 10 });
    await scheduler.planCalls(at('2026-11-09', 10));
    fakeLine();
    await scheduler.dialDueCalls(at('2026-11-09', 17, 30));
    let call = await db.voiceCall.findFirstOrThrow({ where: { familyId: f.fam.id } });
    await outcomes.recordCallResult({ providerCallId: call.providerCallId!, answered: false, failureReason: 'no-answer' }, at('2026-11-09', 17, 31));
    call = await db.voiceCall.findUniqueOrThrow({ where: { id: call.id } });
    expect(call.status).toBe('SCHEDULED');
    expect(call.scheduledFor.toISOString()).toBe(at('2026-11-09', 18, 1).toISOString());

    await scheduler.dialDueCalls(at('2026-11-09', 18, 5));
    call = await db.voiceCall.findUniqueOrThrow({ where: { id: call.id } });
    await outcomes.recordCallResult({ providerCallId: call.providerCallId!, answered: false, failureReason: 'busy' }, at('2026-11-09', 18, 6));
    expect((await db.voiceCall.findUniqueOrThrow({ where: { id: call.id } })).status).toBe('NO_ANSWER');
    expect(await db.supportTicket.count({ where: { familyId: f.fam.id, category: 'VISIT_PREPARATION' } })).toBe(1);
  });

  it('stops when the family turns it off, even after it was planned', async () => {
    const f = await family({ calls: ['FASTING_PREP'] });
    await booking(f, { fastingHours: 12 });
    await scheduler.planCalls(at('2026-11-09', 10));
    await consent.setCallPreferences({ familyId: f.fam.id, userId: f.user.id, parentName: 'Lakshmi', choices: { FASTING_PREP: false } });
    expect((await db.voiceCall.findFirstOrThrow({ where: { familyId: f.fam.id } })).status).toBe('CANCELLED');
  });

  it('records what it would have said when there is no phone line', async () => {
    const f = await family({ calls: ['FASTING_PREP'] });
    await booking(f, { fastingHours: 10 });
    await scheduler.planCalls(at('2026-11-09', 10));
    await scheduler.dialDueCalls(at('2026-11-09', 17, 45));
    const call = await db.voiceCall.findFirstOrThrow({ where: { familyId: f.fam.id } });
    expect(call.status).toBe('SIMULATED');
    expect(call.summary).toContain('nothing was dialled');
  });
});

describe('a door nobody answers', () => {
  it('calls the parent at once, then the family, and books another visit when nobody is home', async () => {
    const f = await family({ calls: ['MISSED_DOOR'] });
    const b = await booking(f, { status: 'ARRIVED', windowStart: at('2026-11-10', 7, 30) });
    const rang = fakeLine();
    const now = at('2026-11-10', 7, 45);

    const first = await scheduler.onDoorNotAnswered(b.id, now);
    expect(first).toMatchObject({ status: 'DIALING', recipientRole: 'PATIENT' });
    await outcomes.recordCallResult({ providerCallId: first!.providerCallId!, answered: false, failureReason: 'no-answer' }, now);

    const second = await db.voiceCall.findFirstOrThrow({ where: { bookingId: b.id, recipientRole: 'FAMILY' } });
    expect(second.status).toBe('DIALING');
    expect(rang.map((r) => r.to)).toEqual([f.patient.phone, f.user.phone]);

    await outcomes.recordCallResult({
      providerCallId: second.providerCallId!,
      answered: true,
      data: { reached_person: true, door_response: 'not_home', door_message: 'She is at the temple till 10' },
    }, now);
    const t = await db.supportTicket.findFirstOrThrow({ where: { familyId: f.fam.id, category: 'SCHEDULING' } });
    expect(t.subject).toContain('not home');
    expect(t.body).toBe('She is at the temple till 10');
  });

  it('goes straight to the family when the parent has no phone', async () => {
    const f = await family({ calls: ['MISSED_DOOR'], patientPhone: null });
    const b = await booking(f, { status: 'ARRIVED' });
    fakeLine();
    const call = await scheduler.onDoorNotAnswered(b.id, at('2026-11-10', 7, 50));
    expect(call).toMatchObject({ recipientRole: 'FAMILY', toPhone: f.user.phone });
  });
});

describe('after the visit', () => {
  it('asks the two questions and keeps the answers for the technician’s record', async () => {
    const f = await family({ calls: ['POST_VISIT_CHECKIN'] });
    const visited = at('2026-11-10', 7, 40);
    const b = await booking(f, { status: 'COLLECTED', arrivedAt: visited });
    await scheduler.planCalls(at('2026-11-10', 9, 0));
    const call = await db.voiceCall.findFirstOrThrow({ where: { bookingId: b.id } });
    expect(call.scheduledFor.toISOString()).toBe(at('2026-11-10', 10, 0).toISOString());

    fakeLine();
    await scheduler.dialDueCalls(at('2026-11-10', 10, 5));
    const dialled = await db.voiceCall.findUniqueOrThrow({ where: { id: call.id } });
    await outcomes.recordCallResult({
      providerCallId: dialled.providerCallId!,
      answered: true,
      data: { reached_person: true, on_time: 'no', gentle: 'yes', visit_comment: 'Came at 8:50' },
    });
    expect(await db.visitFeedback.findUniqueOrThrow({ where: { bookingId: b.id } })).toMatchObject({
      technicianId: f.technician.id,
      onTime: 'NO',
      gentle: 'YES',
      comment: 'Came at 8:50',
    });
    expect(await db.supportTicket.count({ where: { familyId: f.fam.id, category: 'VISIT_QUALITY' } })).toBe(1);
  });
});

describe('the report', () => {
  async function released(f: Awaited<ReturnType<typeof family>>, critical: boolean) {
    const b = await booking(f, { status: 'REPORTED', arrivedAt: at('2026-11-10', 7, 40) });
    const lab = await db.lab.create({
      data: { name: 'L', legalName: 'L', contactName: 'L', contactPhone: '+919800000000', contactEmail: 'l@x.in', addressLine: 'x', city: 'x', state: 'x', pincode: '560001', latitude: 12.9, longitude: 77.5 },
    });
    const report = await db.report.create({
      data: { bookingId: b.id, patientId: f.patient.id, labId: lab.id, status: 'RELEASED', releasedAt: new Date() },
    });
    if (critical) await db.criticalValueAlert.create({ data: { reportId: report.id, parameterName: 'Potassium', raisedAt: new Date() } });
    return report;
  }

  it('is called in, at a civil hour where the family lives', async () => {
    const f = await family({ calls: ['REPORT_READY'], tz: 'Europe/London' });
    const report = await released(f, false);
    const call = await scheduler.onReportReleased(report.id, at('2026-11-12', 3, 0, 'Europe/London'));
    expect(call).toMatchObject({ kind: 'REPORT_READY', recipientRole: 'FAMILY', status: 'SCHEDULED', timeZone: 'Europe/London' });
    expect(call!.scheduledFor.toISOString()).toBe(at('2026-11-12', 8, 30, 'Europe/London').toISOString());
  });

  it('is left to a person when a value is critical', async () => {
    const f = await family({ calls: ['REPORT_READY'] });
    const report = await released(f, true);
    expect(await scheduler.onReportReleased(report.id, at('2026-11-12', 11))).toBeNull();
    expect(await db.voiceCall.count({ where: { familyId: f.fam.id } })).toBe(0);
  });
});

describe('when the next test is due', () => {
  it('offers the usual slot, and a yes becomes a request the family confirms', async () => {
    const f = await family({ calls: ['DUE_NUDGE'] });
    // Last visit a Tuesday, 27 days ago: due in three days, reminder window open.
    const last = at('2026-10-13', 7, 30);
    await booking(f, { status: 'CLOSED', windowStart: last, arrivedAt: last });
    const now = at('2026-11-09', 11);
    await scheduler.planCalls(now);
    const call = await db.voiceCall.findFirstOrThrow({ where: { familyId: f.fam.id, kind: 'DUE_NUDGE' } });
    expect(call.recipientRole).toBe('FAMILY');

    const rang = fakeLine();
    await scheduler.dialDueCalls(now);
    // The usual slot: Tuesday 17 November, first Tuesday on or after the due date.
    expect(rang[0].vars.call_brief).toContain('Tuesday, 17 November');

    const dialled = await db.voiceCall.findUniqueOrThrow({ where: { id: call.id } });
    await outcomes.recordCallResult({
      providerCallId: dialled.providerCallId!,
      answered: true,
      data: { reached_person: true, wants_booking: true, booking_date: '2026-11-17', booking_hour: 7 },
    }, now);
    const request = await db.voiceBookingRequest.findFirstOrThrow({ where: { familyId: f.fam.id } });
    expect(request).toMatchObject({ source: 'DUE_NUDGE', status: 'NEW', preferredDate: '2026-11-17', windowStartHour: 7, patientId: f.patient.id });

    // With a request open, no second reminder.
    await db.voiceCall.deleteMany({ where: { familyId: f.fam.id } });
    await scheduler.planCalls(at('2026-11-10', 11));
    expect(await db.voiceCall.count({ where: { familyId: f.fam.id } })).toBe(0);
  });
});

describe('the monthly update', () => {
  it('rings on the first of the month, in the family’s own evening, with only operational facts', async () => {
    const f = await family({ calls: ['MONTHLY_UPDATE'], tz: 'Europe/London' });
    await booking(f, { status: 'CLOSED', windowStart: at('2026-11-20', 7, 30), arrivedAt: at('2026-11-20', 7, 40) });
    await booking(f, { status: 'SCHEDULED', windowStart: at('2026-12-18', 7, 30) });
    const now = at('2026-12-01', 12, 0, 'Europe/London');
    await scheduler.planCalls(now);
    const call = await db.voiceCall.findFirstOrThrow({ where: { familyId: f.fam.id, kind: 'MONTHLY_UPDATE' } });
    expect(call.scheduledFor.toISOString()).toBe(at('2026-12-01', 18, 30, 'Europe/London').toISOString());

    const rang = fakeLine();
    await scheduler.dialDueCalls(at('2026-12-01', 18, 35, 'Europe/London'));
    const brief = rang.find((r) => r.vars.call_kind === 'MONTHLY_UPDATE')!.vars.call_brief;
    expect(brief).toContain('Lakshmi had one visit');
    expect(brief).toContain('next visit is on Friday, 18 December');
  });
});

describe('call results', () => {
  it('only accept a correct, fresh signature', async () => {
    const { signBody, verifySignature } = await import('@/lib/voice/webhook');
    const body = '{"type":"post_call_transcription"}';
    const now = Date.now();
    const header = signBody(body, 'shh', Math.floor(now / 1000));
    expect(verifySignature(body, header, 'shh', now)).toBe(true);
    expect(verifySignature(body + ' ', header, 'shh', now)).toBe(false);
    expect(verifySignature(body, header, 'other', now)).toBe(false);
    expect(verifySignature(body, header, 'shh', now + 60 * 60_000)).toBe(false);
    expect(verifySignature(body, 'garbage', 'shh', now)).toBe(false);
  });
});

describe('where is the technician', () => {
  it('answers from fresh pings when this is the next stop, and never guesses otherwise', async () => {
    const f = await family();
    const now = at('2026-11-10', 7, 20);
    const route = await db.route.create({
      data: { technicianId: f.technician.id, serviceDate: at('2026-11-10', 0), status: 'STARTED', startedAt: at('2026-11-10', 6, 30) },
    });
    const b = await booking(f, { status: 'EN_ROUTE', windowStart: at('2026-11-10', 7, 30), routeId: route.id });

    expect((await eta.technicianEta(b.id, now))?.state).toBe('NO_SIGNAL');

    // About 1.1 km away, two minutes ago.
    await db.locationPing.create({ data: { routeId: route.id, latitude: 12.94, longitude: 77.58, recordedAt: new Date(now.getTime() - 120_000) } });
    const onTheWay = await eta.technicianEta(b.id, now);
    expect(onTheWay).toMatchObject({ state: 'ON_THE_WAY', minutes: 5, insideWindow: true, technician: 'Priya' });
    expect(eta.describeEta(onTheWay!)).toBe('Priya is about 5 minutes away, inside your window between 7:30 am and 8:30 am.');

    // Another visit comes first: no minute figure.
    await booking(f, { status: 'SCHEDULED', windowStart: at('2026-11-10', 6, 30), routeId: route.id });
    expect(await eta.technicianEta(b.id, now)).toMatchObject({ state: 'VISITS_FIRST', visitsBefore: 1 });
  });
});

describe('deleting the account', () => {
  it('cancels every call still waiting', async () => {
    const { closeAccount } = await import('@/lib/account/deletion');
    const f = await family({ calls: ['FASTING_PREP'] });
    await booking(f, { status: 'CLOSED', windowStart: at('2026-10-01', 7, 30) });
    const b = await booking(f, { fastingHours: 10, windowStart: at('2026-12-10', 7, 30) });
    await scheduler.planCalls(at('2026-12-09', 10));
    expect(await db.voiceCall.count({ where: { bookingId: b.id, status: 'SCHEDULED' } })).toBe(1);
    // Scheduled visits block deletion; this one is cancelled first, as the app asks.
    await db.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED' } });
    expect((await closeAccount(f.user.id)).ok).toBe(true);
    expect(await db.voiceCall.count({ where: { familyId: f.fam.id, status: 'SCHEDULED' } })).toBe(0);
  });
});

describe('when someone calls us', () => {
  it('knows the in-app caller only by a session it signed itself', async () => {
    const answers = await import('@/lib/voice/answers');
    const token = answers.signCallerSession('user_1', Date.now());
    expect(answers.verifyCallerSession(token)).toBe('user_1');
    expect(answers.verifyCallerSession(token.replace('user_1', 'user_2'))).toBeNull();
    expect(answers.verifyCallerSession(token, Date.now() + 3 * 3_600_000)).toBeNull();
  });

  it('recognises a family member or a parent by the number they ring from', async () => {
    const answers = await import('@/lib/voice/answers');
    const f = await family();
    expect(await answers.callerFromPhone(f.user.phone.slice(3))).toMatchObject({ userId: f.user.id, familyId: f.fam.id, patientId: null });
    expect(await answers.callerFromPhone(f.patient.phone!)).toMatchObject({ familyId: f.fam.id, patientId: f.patient.id });
    expect(await answers.callerFromPhone('+919000000001')).toMatchObject({ familyId: null });
  });

  it('gives the fasting rule for the actual visit, and leaves medicines to a person', async () => {
    const answers = await import('@/lib/voice/answers');
    const { guardOutput } = await import('@/lib/providers/voice/guardrails');
    const f = await family();
    await booking(f, { fastingHours: 12, windowStart: at('2027-01-05', 7, 30) });
    const text = await answers.fastingAnswer(await answers.callerFromPhone(f.patient.phone!), at('2027-01-04', 12));
    expect(text).toContain('7:30 pm');
    expect(text).toContain('a coordinator will call you');
    expect(guardOutput(text).allowed).toBe(true);
  });

  it('notes a visit a parent asks for by voice, for the family to confirm, and a stranger’s for a callback', async () => {
    const answers = await import('@/lib/voice/answers');
    const f = await family();
    const parent = await answers.callerFromPhone(f.patient.phone!);
    const said = await answers.requestVisitAnswer(parent, { preferred_date: '2027-01-12', preferred_window_hour: 8, tests: 'the usual sugar test' });
    expect(said).toContain('Tuesday, 12 January, 8:30 to 9:30 am');
    expect(await db.voiceBookingRequest.findFirstOrThrow({ where: { familyId: f.fam.id } })).toMatchObject({
      source: 'INBOUND_CALL',
      patientId: f.patient.id,
      status: 'NEW',
      testsRequested: 'the usual sugar test',
      bookingId: null,
    });
    // Nothing is booked or charged by a phone call.
    expect(await db.booking.count({ where: { familyId: f.fam.id } })).toBe(0);

    const stranger = await answers.callerFromPhone('+919000000002');
    await answers.requestVisitAnswer(stranger, { preferred_date: '2027-01-12' });
    expect(await db.supportTicket.count({ where: { category: 'VOICE_BOOKING', subject: { contains: '+919000000002' } } })).toBe(1);
  });
});
