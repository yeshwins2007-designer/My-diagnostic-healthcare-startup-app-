/**
 * Sign-in code security, against a real (throwaway) database: the budgets
 * live in the database precisely so they hold across server instances, so
 * that is where they have to be tested.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DB_FILE = path.resolve(import.meta.dirname, '../prisma/otp-security-test.db');
process.env.DATABASE_URL = `file:${DB_FILE}`;

type Otp = typeof import('@/lib/auth/otp');
let otp: Otp;
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

let n = 0;
const freshPhone = () => `+9198700${String(10000 + n++).slice(-5)}`;

/** Ages every code for a number past the resend cooldown. */
async function backdate(phone: string, seconds: number) {
  const past = new Date(Date.now() - seconds * 1000);
  await db.otpChallenge.updateMany({ where: { phone }, data: { createdAt: past } });
}

describe('sign-in codes', () => {
  it('accepts the right code once, and never twice', async () => {
    const phone = freshPhone();
    const sent = await otp.requestOtp(phone);
    expect(sent.ok).toBe(true);
    expect((await otp.verifyOtp(phone, sent.devCode!)).ok).toBe(true);
    expect((await otp.verifyOtp(phone, sent.devCode!)).ok).toBe(false);
  });

  it('cannot be raced: parallel wrong guesses never exceed the per-code limit', async () => {
    const phone = freshPhone();
    const sent = await otp.requestOtp(phone);
    const wrong = sent.devCode === '123456' ? '654321' : '123456';
    await Promise.all(Array.from({ length: 25 }, () => otp.verifyOtp(phone, wrong)));
    const challenge = await db.otpChallenge.findFirstOrThrow({ where: { phone } });
    expect(challenge.attempts).toBeLessThanOrEqual(challenge.maxAttempts);
    // And the right code no longer works once the guesses are spent.
    expect((await otp.verifyOtp(phone, sent.devCode!)).ok).toBe(false);
  });

  it('stops issuing codes after five an hour for one number', async () => {
    const phone = freshPhone();
    for (let i = 0; i < 5; i++) {
      expect((await otp.requestOtp(phone)).ok).toBe(true);
      await backdate(phone, 31); // past the 30-second resend cooldown
    }
    const sixth = await otp.requestOtp(phone);
    expect(sixth.ok).toBe(false);
    expect(sixth.message).toMatch(/wait an hour/);
  });

  it('locks a number after ten wrong guesses across fresh codes, even for the right code', async () => {
    const phone = freshPhone();
    let last = '';
    for (let round = 0; round < 2; round++) {
      const sent = await otp.requestOtp(phone);
      expect(sent.ok).toBe(true);
      last = sent.devCode!;
      const wrong = last === '111111' ? '222222' : '111111';
      for (let i = 0; i < 5; i++) await otp.verifyOtp(phone, wrong);
      await backdate(phone, 31);
    }
    // Ten failures in the hour: no new code, and no sign-in.
    expect((await otp.requestOtp(phone)).ok).toBe(false);
    const verdict = await otp.verifyOtp(phone, last);
    expect(verdict.ok).toBe(false);
  });
});
