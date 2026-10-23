/**
 * The partner order engine, against a real (throwaway) database: accepting,
 * rejecting, re-routing to the next lab, and handing an order nobody can
 * take to a person. Plus the pure rules it is built on: the decision window,
 * results parsing, payouts, the traffic controller and the logo URL.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseResultValues, testsOfOrder } from '@/lib/orders/results';
import { homeFor, signInFor } from '@/lib/auth/home';
import { istDayKey, istStartOfDay, istTime } from '@/lib/orders/ist';
import { labLogoUrl, monogram } from '@/lib/brandfetch';

const DB_FILE = path.resolve(import.meta.dirname, '../prisma/partner-orders-test.db');
process.env.DATABASE_URL = `file:${DB_FILE}`;

type Orders = typeof import('@/lib/orders/lab-orders');
let orders: Orders;
let db: typeof import('@/lib/db').db;

beforeAll(async () => {
  fs.rmSync(DB_FILE, { force: true });
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    env: { ...process.env, DATABASE_URL: `file:${DB_FILE}` },
    stdio: 'ignore',
  });
  orders = await import('@/lib/orders/lab-orders');
  ({ db } = await import('@/lib/db'));
}, 60_000);

afterAll(async () => {
  await db?.$disconnect();
  fs.rmSync(DB_FILE, { force: true });
});

// --- pure rules ------------------------------------------------------------------

describe('the decision window', () => {
  const paid = new Date('2026-10-13T08:00:00Z');

  it('is 30 minutes when the visit is far off', () => {
    const deadline = orders.decisionDeadline(paid, new Date('2026-10-14T01:00:00Z'));
    expect(deadline?.toISOString()).toBe('2026-10-13T08:30:00.000Z');
  });

  it('closes 3 hours before the visit when that comes first', () => {
    const deadline = orders.decisionDeadline(paid, new Date('2026-10-13T11:15:00Z'));
    expect(deadline?.toISOString()).toBe('2026-10-13T08:15:00.000Z');
  });

  it('does not open at all inside the 3-hour cutoff: the order is accepted at once', () => {
    expect(orders.decisionDeadline(paid, new Date('2026-10-13T10:30:00Z'))).toBeNull();
    const opened = orders.openLabDecision(new Date('2026-10-13T10:30:00Z'), paid);
    expect(opened.labDecision).toBe('ACCEPTED');
    expect(opened.labDecisionAt).toEqual(paid);
  });
});

describe('results parsing', () => {
  const tests = [
    { id: 't1', code: 'HBA1C', name: 'HbA1c' },
    { id: 't2', code: 'GLU_F', name: 'Fasting glucose' },
    { id: 't3', code: 'URINE_R', name: 'Urine routine' },
  ];

  it('bands every value and takes the worst band overall', () => {
    const r = parseResultValues('HBA1C=9.4 | GLU_F=92\nURINE_R=Pus cells 2-3/hpf', tests);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.parameters.find((p) => p.code === 'HBA1C')?.band).toBe('RED');
    expect(r.parameters.find((p) => p.code === 'GLU_F')?.band).toBe('GREEN');
    expect(r.overall).toBe('RED');
  });

  it('refuses a missing test instead of reporting green', () => {
    const r = parseResultValues('HBA1C=5.1 | URINE_R=normal', tests);
    expect(r).toEqual({ ok: false, errors: ['Every test in the order needs a value. Missing: GLU_F.'] });
  });

  it('refuses unknown codes, blanks, duplicates and numbers with units', () => {
    const r = parseResultValues('HBAIC=5 | GLU_F= | HBA1C=9.4% | URINE_R=a | URINE_R=b', tests);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(' ')).toMatch(/HBAIC is not a test in this order/);
    expect(r.errors.join(' ')).toMatch(/GLU_F has no value/);
    expect(r.errors.join(' ')).toMatch(/HBA1C needs a plain number/);
    expect(r.errors.join(' ')).toMatch(/URINE_R is entered twice/);
  });

  it('counts single tests as well as panel tests, once each', () => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    expect(testsOfOrder([{ panel: { items: [{ test: a }, { test: b }] } }, { test: a }]).map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('payouts', () => {
  it('pays each test in the order once at the rate card, and lists unpriced tests', () => {
    const rate = new Map([['a', 32_000], ['b', 4_500]]);
    expect(orders.labPayout([{ panel: { items: [{ test: { id: 'a' } }, { test: { id: 'b' } }] } }, { test: { id: 'c' } }], rate)).toEqual({
      paise: 36_500,
      unpriced: ['c'],
    });
  });
});

describe('the traffic controller', () => {
  it('sends each role to its own app', () => {
    expect(homeFor('CAREGIVER')).toBe('/caregiver');
    expect(homeFor('LAB')).toBe('/lab');
    expect(homeFor('TECHNICIAN')).toBe('/field');
    expect(homeFor('OPS')).toBe('/ops');
    expect(homeFor('SOMETHING_ELSE')).toBe('/');
    expect(homeFor(null)).toBe('/');
  });

  it('signs partners in at their own door', () => {
    expect(signInFor('lab')).toBe('/lab/login');
    expect(signInFor('family')).toBe('/login');
  });
});

describe('IST calendar', () => {
  it('puts 20:00 UTC on the next Indian day', () => {
    const at = new Date('2026-10-13T20:00:00Z');
    expect(istDayKey(at)).toBe('2026-10-14');
    expect(istStartOfDay(at).toISOString()).toBe('2026-10-13T18:30:00.000Z');
    expect(istTime(at)).toBe('01:30');
  });
});

describe('lab logos', () => {
  it('needs both a client id and a real domain', () => {
    vi.stubEnv('NEXT_PUBLIC_BRANDFETCH_CLIENT_ID', '');
    expect(labLogoUrl('ananya.in')).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_BRANDFETCH_CLIENT_ID', 'abc123');
    expect(labLogoUrl('ananya.in')).toBe('https://cdn.brandfetch.io/ananya.in/w/96/h/96/theme/dark/fallback/lettermark?c=abc123');
    expect(labLogoUrl('not a domain')).toBeNull();
    expect(labLogoUrl('evil.com/../x')).toBeNull();
    vi.unstubAllEnvs();
  });

  it('falls back to a monogram', () => {
    expect(monogram('Ananya Diagnostics')).toBe('AD');
    expect(monogram('Neuberg')).toBe('NE');
  });
});

// --- against the database -----------------------------------------------------------

let n = 0;
let testId: string;
let labs: { anchor: string; near: string; far: string };
let u: string;

async function makeLab(name: string, lat: number, lng: number) {
  n += 1;
  const lab = await db.lab.create({
    data: {
      name,
      legalName: `${name} Pvt Ltd`,
      contactName: 'Owner',
      contactPhone: `+91990000${String(n).padStart(4, '0')}`,
      contactEmail: `lab${n}@example.com`,
      addressLine: 'Somewhere',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560011',
      latitude: lat,
      longitude: lng,
      status: 'ACTIVE',
      capacityCeiling: 50,
      accreditation: {
        create: {
          certificateNumber: `MC-9${String(n).padStart(3, '0')}`,
          scope: 'CLINICAL_BIOCHEMISTRY',
          validFrom: new Date('2025-01-01'),
          validUntil: new Date('2030-01-01'),
          supervisingPathologistName: 'Dr. Test',
          supervisingPathologistReg: 'KMC/1',
        },
      },
      rateCard: { create: [{ testId, costPaise: 32_000 }] },
    },
  });
  const user = await db.user.create({ data: { phone: `+91980000${String(n).padStart(4, '0')}`, name: `${name} owner`, role: 'LAB' } });
  await db.labMember.create({ data: { labId: lab.id, userId: user.id, role: 'OWNER' } });
  return lab.id;
}

async function makeOrder(labId: string, opts: { visitInHours?: number; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const family = await db.family.create({ data: { name: 'Test family' } });
  const patient = await db.patient.create({
    data: { familyId: family.id, name: 'Saraswathi K', ageYears: 76, sex: 'FEMALE', ageBand: 'BAND_70_80' },
  });
  const address = await db.patientAddress.create({
    data: { patientId: patient.id, line1: '14, 11th Main', city: 'Bengaluru', state: 'Karnataka', pincode: '560011', latitude: 12.93, longitude: 77.58 },
  });
  const windowStart = new Date(now.getTime() + (opts.visitInHours ?? 24) * 3_600_000);
  n += 1;
  return db.booking.create({
    data: {
      reference: `SS-T${String(n).padStart(5, '0')}`,
      familyId: family.id,
      patientId: patient.id,
      addressId: address.id,
      labId,
      status: 'SCHEDULED',
      windowStart,
      windowEnd: new Date(windowStart.getTime() + 3_600_000),
      totalPaise: 54_900,
      items: { create: [{ testId, pricePaise: 54_900 }] },
      ...orders.openLabDecision(windowStart, now),
    },
  });
}

describe('accepting and rejecting orders', () => {
  beforeAll(async () => {
    const test = await db.testDefinition.create({
      data: { code: 'HBA1C', name: 'HbA1c', discipline: 'CLINICAL_BIOCHEMISTRY', sampleType: 'WHOLE_BLOOD', tubeType: 'Lavender (EDTA)', pricePaise: 54_900 },
    });
    testId = test.id;
    u = (await db.user.create({ data: { phone: '+919800009999', name: 'Lab staff', role: 'LAB' } })).id;
    labs = {
      anchor: await makeLab('Anchor Labs', 12.93, 77.58),
      near: await makeLab('Near Labs', 12.94, 77.59),
      far: await makeLab('Far Labs', 12.99, 77.62),
    };
    // About 18 km away: accredited and active, but too far to ever be chosen.
    await makeLab('Whitefield Labs', 12.9698, 77.75);
  });

  beforeEach(async () => {
    await db.labRateCardEntry.updateMany({ data: { isPaused: false, pausedReason: '' } });
  });

  it('opens a paid order as pending, and accepting it is final', async () => {
    const order = await makeOrder(labs.anchor);
    expect(order.labDecision).toBe('PENDING');
    const first = await orders.acceptOrder({ bookingId: order.id, labId: labs.anchor, userId: u });
    expect(first.ok).toBe(true);
    const again = await orders.acceptOrder({ bookingId: order.id, labId: labs.anchor, userId: u });
    expect(again).toEqual({ ok: false, message: 'This order has already been decided.' });
    const reject = await orders.rejectOrder({ bookingId: order.id, labId: labs.anchor, userId: u, reason: 'At capacity for that day' });
    expect(reject.ok).toBe(false);
  });

  it('another lab cannot decide an order that is not routed to it', async () => {
    const order = await makeOrder(labs.anchor);
    const r = await orders.acceptOrder({ bookingId: order.id, labId: labs.near, userId: u });
    expect(r).toEqual({ ok: false, message: 'That order is not routed to your laboratory.' });
  });

  it('re-routes a rejection to the nearest lab that can take it, price unchanged', async () => {
    const order = await makeOrder(labs.anchor);
    const r = await orders.rejectOrder({ bookingId: order.id, labId: labs.anchor, userId: u, reason: 'At capacity for that day' });
    expect(r.ok).toBe(true);
    expect(r.reroutedToLabId).toBe(labs.near);
    const after = await db.booking.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.labId).toBe(labs.near);
    expect(after.labDecision).toBe('PENDING');
    expect(after.rejectedLabIds).toBe(labs.anchor);
    expect(after.totalPaise).toBe(54_900);
  });

  it('skips a lab that has paused a test in the order', async () => {
    await db.labRateCardEntry.updateMany({ where: { labId: labs.near }, data: { isPaused: true, pausedReason: 'Analyser down' } });
    const order = await makeOrder(labs.anchor);
    const r = await orders.rejectOrder({ bookingId: order.id, labId: labs.anchor, userId: u, reason: 'At capacity for that day' });
    expect(r.reroutedToLabId).toBe(labs.far);
  });

  it('never offers an order back to a lab that rejected it, and hands it to ops when no lab is left', async () => {
    // Whitefield Labs could do the tests, but is too far for the sample.
    const order = await makeOrder(labs.anchor);
    await orders.rejectOrder({ bookingId: order.id, labId: labs.anchor, userId: u, reason: 'At capacity for that day' });
    await orders.rejectOrder({ bookingId: order.id, labId: labs.near, userId: u, reason: 'At capacity for that day' });
    const last = await orders.rejectOrder({ bookingId: order.id, labId: labs.far, userId: u, reason: 'Other: analyser down' });
    expect(last).toMatchObject({ ok: true, reroutedToLabId: null });
    const after = await db.booking.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.labId).toBeNull();
    expect(after.labDecision).toBe('UNROUTED');
    expect(after.rejectedLabIds.split(',').sort()).toEqual([labs.anchor, labs.near, labs.far].sort());
    const incident = await db.incident.findFirstOrThrow({ where: { bookingId: order.id } });
    expect(incident).toMatchObject({ kind: 'NO_LAB_AVAILABLE', tier: 'TIER_2_MAJOR', status: 'OPEN' });
  });

  it('cannot be both accepted and rejected when two people tap at once', async () => {
    const order = await makeOrder(labs.anchor);
    const [a, r] = await Promise.all([
      orders.acceptOrder({ bookingId: order.id, labId: labs.anchor, userId: u }),
      orders.rejectOrder({ bookingId: order.id, labId: labs.anchor, userId: u, reason: 'At capacity for that day' }),
    ]);
    expect([a.ok, r.ok].filter(Boolean)).toHaveLength(1);
  });

  it('counts an order as accepted once its window has closed', async () => {
    const paidAt = new Date(Date.now() - 45 * 60_000);
    const order = await makeOrder(labs.anchor, { now: paidAt });
    const late = await orders.rejectOrder({ bookingId: order.id, labId: labs.anchor, userId: u, reason: 'At capacity for that day' });
    expect(late).toEqual({ ok: false, message: 'The window to decide has closed, so this order is accepted.' });
    expect(await orders.autoAcceptExpired(labs.anchor)).toBeGreaterThanOrEqual(1);
    const after = await db.booking.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.labDecision).toBe('ACCEPTED');
  });
});
