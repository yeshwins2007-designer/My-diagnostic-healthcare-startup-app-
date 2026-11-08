/**
 * The store reviewers' sign-in, against a real (throwaway) database. One
 * number, set by the operator, takes a fixed code instead of an SMS; every
 * other rule a code has still holds, and no other number is affected.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DB_FILE = path.resolve(import.meta.dirname, '../prisma/app-review-test.db');
const REVIEW_PHONE = '+919811100000';
const REVIEW_CODE = '424242';
process.env.DATABASE_URL = `file:${DB_FILE}`;
process.env.APP_REVIEW_PHONE = REVIEW_PHONE;
process.env.APP_REVIEW_CODE = REVIEW_CODE;

let otp: typeof import('@/lib/auth/otp');
let db: typeof import('@/lib/db').db;

beforeAll(async () => {
  fs.rmSync(DB_FILE, { force: true });
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    env: { ...process.env, DATABASE_URL: `file:${DB_FILE}` },
    stdio: 'ignore',
  });
  otp = await import('@/lib/auth/otp');
  ({ db } = await import('@/lib/db'));
}, 60_000);

afterAll(async () => {
  await db?.$disconnect();
  fs.rmSync(DB_FILE, { force: true });
});

async function backdate(phone: string) {
  await db.otpChallenge.updateMany({ where: { phone }, data: { createdAt: new Date(Date.now() - 60_000) } });
}

function seedReview(phone = REVIEW_PHONE) {
  return execSync('npx tsx scripts/seed-review-account.ts', {
    env: { ...process.env, DATABASE_URL: `file:${DB_FILE}`, APP_REVIEW_PHONE: phone },
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

describe('the review number', () => {
  it('takes the fixed code, sends no SMS and shows no code on screen', async () => {
    const sent = await otp.requestOtp(REVIEW_PHONE);
    expect(sent).toEqual({ ok: true, message: `We sent a 6-digit code to ${REVIEW_PHONE}.` });
    expect((await otp.verifyOtp(REVIEW_PHONE, REVIEW_CODE)).ok).toBe(true);
  });

  it('is still single use: the code works again only after asking again', async () => {
    expect((await otp.verifyOtp(REVIEW_PHONE, REVIEW_CODE)).ok).toBe(false);
    await backdate(REVIEW_PHONE);
    await otp.requestOtp(REVIEW_PHONE);
    expect((await otp.verifyOtp(REVIEW_PHONE, REVIEW_CODE)).ok).toBe(true);
  });

  it('still limits wrong guesses', async () => {
    await backdate(REVIEW_PHONE);
    await otp.requestOtp(REVIEW_PHONE);
    for (let i = 0; i < 5; i++) await otp.verifyOtp(REVIEW_PHONE, '000000');
    expect((await otp.verifyOtp(REVIEW_PHONE, REVIEW_CODE)).ok).toBe(false);
  });

  it('changes nothing for any other number, or for sign-up checks', async () => {
    const other = await otp.requestOtp('+919811100001');
    expect(other.devCode).toMatch(/^\d{6}$/);
    expect((await otp.verifyOtp('+919811100001', REVIEW_CODE)).ok).toBe(other.devCode === REVIEW_CODE);

    const register = await otp.requestOtp(REVIEW_PHONE, 'REGISTER');
    expect(register.devCode).toMatch(/^\d{6}$/);
  });
});

describe('the review account', () => {
  it('needs an open zone with a partner lab, so reviewers never land on the waitlist', () => {
    expect(() => seedReview()).toThrow(/No open zone/);
  });

  it('gets one sample parent inside the first zone, and running it twice changes nothing', async () => {
    const lab = await db.lab.create({
      data: {
        name: 'Test Lab', legalName: 'Test Lab Pvt Ltd', contactName: 'A', contactPhone: '+919800000009',
        contactEmail: 'lab@example.com', addressLine: '1 Road', city: 'Mysuru', state: 'Karnataka',
        pincode: '570001', latitude: 12.3, longitude: 76.65, status: 'ACTIVE',
      },
    });
    await db.zone.create({ data: { name: 'Zone 1', city: 'Mysuru', centerLat: 12.3, centerLng: 76.65, anchorLabId: lab.id } });

    seedReview();
    seedReview();

    const user = await db.user.findUniqueOrThrow({ where: { phone: REVIEW_PHONE }, include: { families: true } });
    expect(user.role).toBe('CAREGIVER');
    expect(user.families).toHaveLength(1);
    const patients = await db.patient.findMany({ where: { familyId: user.families[0].familyId }, include: { addresses: true } });
    expect(patients).toHaveLength(1);
    expect(patients[0].addresses[0]).toMatchObject({ city: 'Mysuru', pincode: '570001', latitude: 12.3, longitude: 76.65 });
    expect(await db.booking.count()).toBe(0);
  }, 60_000);

  it('comes back after a reviewer deletes it, ready for the next review', async () => {
    const { closeAccount } = await import('@/lib/account/deletion');
    const user = await db.user.findUniqueOrThrow({ where: { phone: REVIEW_PHONE } });
    expect((await closeAccount(user.id)).ok).toBe(true);

    seedReview();

    const back = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(back).toMatchObject({ isActive: true, deletionRequestedAt: null });
    expect(await db.patient.count({ where: { family: { members: { some: { userId: user.id } } } } })).toBe(1);
  }, 30_000);

  it('refuses a number that already belongs to someone else', async () => {
    await db.user.create({ data: { phone: '+919811100002', name: 'Staff', role: 'OPS' } });
    expect(() => seedReview('+919811100002')).toThrow(/another account/);
  }, 30_000);
});
