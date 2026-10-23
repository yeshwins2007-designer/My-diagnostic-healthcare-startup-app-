/**
 * Email + password sign-in, against a real (throwaway) database: lockouts and
 * code budgets are kept there so they hold across servers, so that is where
 * they are tested. Each test is an attack, or a mistake a family could make.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const DB_FILE = path.resolve(import.meta.dirname, '../prisma/email-auth-test.db');
process.env.DATABASE_URL = `file:${DB_FILE}`;

let auth: typeof import('@/lib/auth/email-auth');
let password: typeof import('@/lib/auth/password');
let db: typeof import('@/lib/db').db;

beforeAll(async () => {
  fs.rmSync(DB_FILE, { force: true });
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    env: { ...process.env, DATABASE_URL: `file:${DB_FILE}` },
    stdio: 'ignore',
  });
  auth = await import('@/lib/auth/email-auth');
  password = await import('@/lib/auth/password');
  ({ db } = await import('@/lib/db'));
}, 60_000);

afterAll(async () => {
  await db?.$disconnect();
  fs.rmSync(DB_FILE, { force: true });
});

let n = 0;
const fresh = () => {
  n += 1;
  return { email: `family${n}@example.com`, phone: `+9197700${String(10000 + n).slice(-5)}` };
};
const GOOD = 'paper lantern river stone';
const wrongCode = (code: string) => (code === '111111' ? '222222' : '111111');

async function register(who = fresh(), pw = GOOD) {
  const started = await auth.startEmailRegistration({ name: 'Meera Pillai', ...who, password: pw });
  if (!started.ok) throw new Error(started.message);
  const done = await auth.completeEmailRegistration({
    registrationId: started.registrationId,
    emailCode: started.devEmailCode!,
    smsCode: started.devSmsCode!,
  });
  return { who, started, done };
}

describe('password storage and rules', () => {
  it('stores scrypt hashes, salted, and checks them', async () => {
    const a = await password.hashPassword(GOOD);
    const b = await password.hashPassword(GOOD);
    expect(a).toMatch(/^scrypt\$32768,8,3\$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain(GOOD);
    expect(await password.verifyPassword(GOOD, a)).toBe(true);
    expect(await password.verifyPassword(`${GOOD}!`, a)).toBe(false);
    expect(await password.verifyPassword(GOOD, 'plain-text')).toBe(false);
  });

  it('refuses short, common and personal passwords', () => {
    expect(password.passwordProblem('short')).toMatch(/at least 12/);
    expect(password.passwordProblem('password1234')).toMatch(/first an attacker/);
    expect(password.passwordProblem('abcabcabcabc')).toMatch(/first an attacker/);
    expect(password.passwordProblem('meera.pillai2026', { email: 'meera.pillai2026@example.com' })).toMatch(/email/);
    expect(password.passwordProblem('call me on 9845012345', { phone: '+919845012345' })).toMatch(/phone/);
    expect(password.passwordProblem('i love medwyn a lot')).toMatch(/name of this service/);
    expect(password.passwordProblem(GOOD, { email: 'meera@example.com', phone: '+919845012345' })).toBeNull();
  });
});

describe('creating an account with email', () => {
  it('needs both the email code and the text message code', async () => {
    const who = fresh();
    const started = await auth.startEmailRegistration({ name: 'Meera Pillai', ...who, password: GOOD });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.devEmailCode).toMatch(/^\d{6}$/);
    expect(started.devSmsCode).toMatch(/^\d{6}$/);

    // Right email code, wrong SMS code: no account, and the email code survives.
    const wrongSms = await auth.completeEmailRegistration({
      registrationId: started.registrationId,
      emailCode: started.devEmailCode!,
      smsCode: wrongCode(started.devSmsCode!),
    });
    expect(wrongSms).toMatchObject({ ok: false, field: 'smsCode' });

    const wrongEmail = await auth.completeEmailRegistration({
      registrationId: started.registrationId,
      emailCode: wrongCode(started.devEmailCode!),
      smsCode: started.devSmsCode!,
    });
    expect(wrongEmail).toMatchObject({ ok: false, field: 'emailCode' });
    expect(await db.user.findUnique({ where: { email: who.email } })).toBeNull();

    const done = await auth.completeEmailRegistration({
      registrationId: started.registrationId,
      emailCode: started.devEmailCode!,
      smsCode: started.devSmsCode!,
    });
    expect(done).toMatchObject({ ok: true, created: true, role: 'CAREGIVER' });

    const user = await db.user.findUniqueOrThrow({ where: { email: who.email }, include: { families: true } });
    expect(user.phone).toBe(who.phone);
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.families).toHaveLength(1);

    // The same codes cannot be replayed.
    const replay = await auth.completeEmailRegistration({
      registrationId: started.registrationId,
      emailCode: started.devEmailCode!,
      smsCode: started.devSmsCode!,
    });
    expect(replay.ok).toBe(false);
  });

  it('sends new codes on request, and only the newest pair works', async () => {
    const who = fresh();
    const first = await auth.startEmailRegistration({ name: 'Meera Pillai', ...who, password: GOOD });
    if (!first.ok) throw new Error(first.message);

    // Too soon: refused, and the first codes still stand.
    expect((await auth.resendRegistrationCodes(first.registrationId)).ok).toBe(false);

    const past = new Date(Date.now() - 31_000);
    await db.emailChallenge.updateMany({ where: { email: who.email }, data: { createdAt: past } });
    await db.otpChallenge.updateMany({ where: { phone: who.phone }, data: { createdAt: past } });
    const second = await auth.resendRegistrationCodes(first.registrationId);
    if (!second.ok) throw new Error(second.message);
    expect(second.registrationId).not.toBe(first.registrationId);

    const stale = await auth.completeEmailRegistration({
      registrationId: first.registrationId,
      emailCode: first.devEmailCode!,
      smsCode: first.devSmsCode!,
    });
    expect(stale.ok).toBe(false);
    const done = await auth.completeEmailRegistration({
      registrationId: second.registrationId,
      emailCode: second.devEmailCode!,
      smsCode: second.devSmsCode!,
    });
    expect(done).toMatchObject({ ok: true, created: true });
  });

  it('never keeps the password, only its hash, while codes are pending', async () => {
    const started = await auth.startEmailRegistration({ name: 'Meera Pillai', ...fresh(), password: GOOD });
    if (!started.ok) throw new Error(started.message);
    const row = await db.emailChallenge.findUniqueOrThrow({ where: { id: started.registrationId } });
    expect(JSON.stringify(row)).not.toContain(GOOD);
    expect(row.pendingPasswordHash).toMatch(/^scrypt\$/);
  });

  it('refuses a weak password before sending anything', async () => {
    const who = fresh();
    const started = await auth.startEmailRegistration({ name: 'Meera Pillai', ...who, password: 'password1234' });
    expect(started.ok).toBe(false);
    expect(await db.emailChallenge.count({ where: { email: who.email } })).toBe(0);
  });

  it('adds email sign-in to the family account that already owns the number', async () => {
    const who = fresh();
    const existing = await db.user.create({ data: { phone: who.phone, name: 'Phone First', role: 'CAREGIVER' } });
    const { done } = await register(who);
    expect(done).toMatchObject({ ok: true, created: false, userId: existing.id });
    const user = await db.user.findUniqueOrThrow({ where: { id: existing.id } });
    expect(user.email).toBe(who.email);
    expect(user.name).toBe('Phone First');
  });

  it('never gives a staff account a password', async () => {
    const who = fresh();
    await db.user.create({ data: { phone: who.phone, name: 'Ops Person', role: 'OPS' } });
    const { done } = await register(who);
    expect(done.ok).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { phone: who.phone } })).passwordHash).toBeNull();
  });

  it('will not take over an email that belongs to another account', async () => {
    const first = await register();
    expect(first.done.ok).toBe(true);
    const thief = { email: first.who.email, phone: fresh().phone };
    const { done } = await register(thief, 'a different long passphrase');
    expect(done.ok).toBe(false);
    expect(await db.user.findUnique({ where: { phone: thief.phone } })).toBeNull();
  });
});

describe('signing in with a password', () => {
  it('signs in with the right password, and says the same thing for every wrong one', async () => {
    const { who } = await register();
    expect(await auth.signInWithPassword(who.email.toUpperCase(), GOOD)).toMatchObject({ ok: true });

    const wrong = await auth.signInWithPassword(who.email, 'not my password at all');
    const unknown = await auth.signInWithPassword('nobody-here@example.com', GOOD);
    expect(wrong.ok).toBe(false);
    expect(unknown.ok).toBe(false);
    if (!wrong.ok && !unknown.ok) expect(wrong.message).toBe(unknown.message);
  });

  it('locks an address after ten wrong passwords, even against the right one', async () => {
    const { who } = await register();
    for (let i = 0; i < 10; i++) await auth.signInWithPassword(who.email, `wrong guess number ${i}`);
    const right = await auth.signInWithPassword(who.email, GOOD);
    expect(right).toMatchObject({ ok: false, locked: true });
  }, 30_000);

  it('locks addresses with no account the same way, so a lockout reveals nothing', async () => {
    const email = 'ghost-account@example.com';
    for (let i = 0; i < 10; i++) await auth.signInWithPassword(email, `guess number ${i}`);
    expect(await auth.signInWithPassword(email, GOOD)).toMatchObject({ ok: false, locked: true });
  }, 30_000);

  it('cannot be raced: parallel guesses never exceed the limit', async () => {
    const { who } = await register();
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) => auth.signInWithPassword(who.email, `parallel guess ${i}`)),
    );
    expect(results.every((r) => !r.ok)).toBe(true);
    // However the race fell, no more than ten guesses were ever checked.
    const checked = results.filter((r) => !r.ok && !r.locked).length;
    expect(checked).toBeLessThanOrEqual(10);
  }, 60_000);

  it('does not let a staff account sign in with a password', async () => {
    const who = fresh();
    await db.user.create({
      data: {
        phone: who.phone,
        name: 'Lab Person',
        role: 'LAB',
        email: who.email,
        emailVerifiedAt: new Date(),
        passwordHash: await password.hashPassword(GOOD),
      },
    });
    expect((await auth.signInWithPassword(who.email, GOOD)).ok).toBe(false);
  });
});

describe('forgot password', () => {
  it('answers the same for an unknown address, and sends no code', async () => {
    const reply = await auth.requestPasswordReset('stranger@example.com');
    expect(reply).toEqual({ ok: true, email: 'stranger@example.com' });
    expect(await db.emailChallenge.count({ where: { email: 'stranger@example.com' } })).toBe(0);
  });

  it('resets with the emailed code, signs out every device, and the old password stops working', async () => {
    const { who, done } = await register();
    if (!done.ok) throw new Error(done.message);
    await db.authSession.create({
      data: { userId: done.userId, tokenId: `t-${n}`, expiresAt: new Date(Date.now() + 86_400_000) },
    });

    const reply = await auth.requestPasswordReset(who.email);
    if (!reply.ok) throw new Error(reply.message);
    expect(reply.devCode).toMatch(/^\d{6}$/);

    // A weak new password is refused without spending the code.
    const weak = await auth.completePasswordReset({ email: who.email, code: reply.devCode!, password: 'short' });
    expect(weak).toMatchObject({ ok: false, field: 'password' });

    const NEW = 'copper kettle on the stove';
    const reset = await auth.completePasswordReset({ email: who.email, code: reply.devCode!, password: NEW });
    expect(reset.ok).toBe(true);

    const sessions = await db.authSession.findMany({ where: { userId: done.userId } });
    expect(sessions.every((s) => s.revokedAt !== null)).toBe(true);
    expect((await auth.signInWithPassword(who.email, GOOD)).ok).toBe(false);
    expect((await auth.signInWithPassword(who.email, NEW)).ok).toBe(true);

    // And the code is single-use.
    const again = await auth.completePasswordReset({ email: who.email, code: reply.devCode!, password: 'yet another long phrase' });
    expect(again.ok).toBe(false);
  });

  it('cannot be used to give a staff account a password', async () => {
    const who = fresh();
    await db.user.create({
      data: { phone: who.phone, name: 'Ops Person', role: 'OPS', email: who.email, emailVerifiedAt: new Date() },
    });
    const reply = await auth.requestPasswordReset(who.email);
    expect(reply).toEqual({ ok: true, email: who.email });
    expect(await db.emailChallenge.count({ where: { email: who.email } })).toBe(0);
  });
});
