/**
 * Email + password: sign-up, sign-in and reset.
 *
 * The rules that make it safe to offer next to phone codes:
 *
 * - Sign-up proves BOTH the email (a code sent there) and the mobile number
 *   (a code by SMS). The number is what the technician and the critical-result
 *   call use, so it cannot be one somebody merely typed.
 * - Sign-in never says whether an address has an account: one message for a
 *   wrong password and an unknown address, and the same time taken for both.
 * - Wrong passwords are counted per address in the database. Ten in fifteen
 *   minutes locks password sign-in for that address - for addresses with no
 *   account too, so the lockout reveals nothing. Phone sign-in still works.
 * - A reset proves the email with a code, and signs out every device.
 * - Families only. Staff see every patient's records; they sign in with a
 *   phone code or a passkey, never a password that could be reused from a
 *   breach somewhere else.
 *
 * Cookie-free, so it can be tested directly; app/actions/email-auth.ts adds
 * the session, the per-address-of-origin limits and the redirects.
 */

import 'server-only';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from '../db';
import { isDemo } from '../env';
import { audit } from '../compliance/audit';
import { generateOtp, hashToken, safeEqual } from '../compliance/crypto';
import { emailCopy, getEmailProvider, type EmailMessage } from '../providers/email';
import { normalisePhone, isValidIndianPhone, requestOtp, verifyOtp } from './otp';
import {
  hashPassword,
  isBreachedPassword,
  passwordProblem,
  verifyAgainstDummy,
  verifyPassword,
} from './password';

const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 30;
const BUDGET_WINDOW_MINUTES = 60;
const MAX_CODES_PER_WINDOW = isDemo ? 100 : 5;
const MAX_FAILED_GUESSES_PER_WINDOW = isDemo ? 200 : 10;
/** How long a sign-up may sit between the details and the codes. */
const REGISTRATION_TTL_MINUTES = 30;

const LOCK_WINDOW_MINUTES = 15;
// A demo's seeded password is public; a lower limit would only let one
// visitor lock the demo account for everyone.
const MAX_PASSWORD_FAILURES = isDemo ? 50 : 10;

/** Accounts that may sign in with a password. */
const PASSWORD_ROLES = new Set(['CAREGIVER']);

const SIGN_IN_FAILED = 'That email and password do not match. Check them, or use “Forgot password?”.';
const LOCKED = `Too many wrong passwords for this email. Sign in with your phone number instead, reset your password, or try again in ${LOCK_WINDOW_MINUTES} minutes.`;

/** Runs a delivery now, or later (after the response) when the caller says so. */
export type Schedule = (task: () => Promise<unknown>) => void | Promise<unknown>;
const now: Schedule = (task) => task();

export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

const emailSchema = z.email().max(254);

export function isValidEmail(email: string): boolean {
  return emailSchema.safeParse(email).success;
}

/** a•••@g•••.com: enough for the owner to recognise, not enough to harvest. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  const dot = domain.lastIndexOf('.');
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${local.charAt(0)}•••@${host.charAt(0)}•••${tld}`;
}

// --- email codes -------------------------------------------------------------

type Purpose = 'REGISTER' | 'RESET';

async function budgetUsed(email: string, purpose: Purpose) {
  const since = new Date(Date.now() - BUDGET_WINDOW_MINUTES * 60_000);
  const recent = await db.emailChallenge.aggregate({
    where: { email, purpose, createdAt: { gte: since } },
    _count: true,
    _sum: { attempts: true },
  });
  return { codes: recent._count, failedGuesses: recent._sum.attempts ?? 0 };
}

interface Pending {
  pendingName: string;
  pendingPhone: string;
  pendingPasswordHash: string;
  pendingLocale: string;
}

type IssueResult =
  | { ok: true; challengeId: string; code: string; message: EmailMessage }
  | { ok: false; message: string };

/** Creates a code for an address. Delivery is left to the caller. */
async function issueEmailCode(email: string, purpose: Purpose, pending?: Pending): Promise<IssueResult> {
  const budget = await budgetUsed(email, purpose);
  if (budget.codes >= MAX_CODES_PER_WINDOW || budget.failedGuesses >= MAX_FAILED_GUESSES_PER_WINDOW) {
    return { ok: false, message: 'Too many codes have been sent to this email. Please wait an hour, or call us.' };
  }

  const live = await db.emailChallenge.findFirst({
    where: { email, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (live) {
    const elapsed = (Date.now() - live.createdAt.getTime()) / 1000;
    if (elapsed < RESEND_COOLDOWN_SECONDS) {
      return { ok: false, message: 'A code was just sent. Please wait a moment before asking for another.' };
    }
    // Only one live code per address and purpose.
    await db.emailChallenge.updateMany({ where: { id: live.id, consumedAt: null }, data: { consumedAt: new Date() } });
  }

  const code = generateOtp();
  const challenge = await db.emailChallenge.create({
    data: {
      email,
      purpose,
      codeHash: hashToken(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
      ...pending,
    },
  });
  const copy = purpose === 'REGISTER' ? emailCopy.register(code) : emailCopy.reset(code);
  return { ok: true, challengeId: challenge.id, code, message: { to: email, ...copy } };
}

type CodeCheck = { ok: true } | { ok: false; message: string };

/**
 * Checks a code WITHOUT consuming it, so a later step failing (the SMS code,
 * a weak new password) does not burn a correct email code. A guess is claimed
 * atomically before comparing, so parallel guesses cannot exceed the limit;
 * a correct one is given back.
 */
async function checkEmailCode(
  challenge: { id: string; email: string; purpose: string; codeHash: string; attempts: number; maxAttempts: number; expiresAt: Date },
  code: string,
): Promise<CodeCheck> {
  if (challenge.expiresAt < new Date()) {
    return { ok: false, message: 'That code has expired. Please ask for a new one.' };
  }
  const budget = await budgetUsed(challenge.email, challenge.purpose as Purpose);
  if (budget.failedGuesses >= MAX_FAILED_GUESSES_PER_WINDOW) {
    return { ok: false, message: 'Too many wrong codes for this email. Please wait an hour, or call us.' };
  }
  const claimed = await db.emailChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null, attempts: { lt: challenge.maxAttempts } },
    data: { attempts: { increment: 1 } },
  });
  if (claimed.count === 0) {
    return { ok: false, message: 'Too many attempts. Please ask for a new code.' };
  }
  if (!safeEqual(hashToken(code.trim()), challenge.codeHash)) {
    const left = challenge.maxAttempts - challenge.attempts - 1;
    return {
      ok: false,
      message:
        left > 0
          ? `That code did not match. ${left} ${left === 1 ? 'try' : 'tries'} left.`
          : 'That code did not match. Please ask for a new code.',
    };
  }
  await db.emailChallenge.update({ where: { id: challenge.id }, data: { attempts: { decrement: 1 } } });
  return { ok: true };
}

/** Consumes a checked code. False if a racing request got there first. */
async function consumeEmailCode(id: string): Promise<boolean> {
  const done = await db.emailChallenge.updateMany({
    where: { id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  return done.count === 1;
}

async function deliver(message: EmailMessage): Promise<{ ok: boolean; simulated: boolean }> {
  const result = await getEmailProvider().send(message);
  if (!result.ok) console.error(`Email to ${maskEmail(message.to)} failed: ${result.error}`);
  return result;
}

async function newPasswordProblem(
  password: string,
  context: { email: string; phone?: string; name?: string },
): Promise<string | null> {
  const problem = passwordProblem(password, context);
  if (problem) return problem;
  if (await isBreachedPassword(password)) {
    return 'That password has appeared in a data breach elsewhere, so attackers try it first. Please choose another.';
  }
  return null;
}

// --- sign-up -------------------------------------------------------------------

export const registrationSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name.').max(120),
  email: z.string().transform(normaliseEmail).pipe(z.email('Enter a valid email address.').max(254)),
  phone: z
    .string()
    .transform(normalisePhone)
    .refine(isValidIndianPhone, 'Enter a valid 10-digit Indian mobile number.'),
  password: z.string(),
  locale: z.string().default('en'),
});
export type RegistrationInput = z.input<typeof registrationSchema>;

export type StartRegistrationResult =
  | {
      ok: true;
      registrationId: string;
      email: string;
      phone: string;
      /** Present only when the provider is simulated. */
      devEmailCode?: string;
      devSmsCode?: string;
    }
  | { ok: false; message: string };

async function sendRegistrationCodes(
  email: string,
  pending: Pending,
): Promise<StartRegistrationResult> {
  // SMS first: if it is refused (cooldown, hourly budget), nothing has
  // changed, and a pending sign-up's current email code still works.
  const sms = await requestOtp(pending.pendingPhone, 'REGISTER');
  if (!sms.ok) return { ok: false, message: sms.message };

  const issued = await issueEmailCode(email, 'REGISTER', pending);
  if (!issued.ok) return issued;
  const sent = await deliver(issued.message);
  if (!sent.ok) {
    return { ok: false, message: 'We could not send the email just now. Please try again in a minute.' };
  }
  return {
    ok: true,
    registrationId: issued.challengeId,
    email,
    phone: pending.pendingPhone,
    ...(sent.simulated ? { devEmailCode: issued.code } : {}),
    ...(sms.devCode ? { devSmsCode: sms.devCode } : {}),
  };
}

/**
 * Step one: check the details, hold them server-side, and send a code to the
 * email and another to the phone. Says nothing yet about whether either is
 * already registered - that is only revealed to someone who proves both.
 */
export async function startEmailRegistration(input: RegistrationInput): Promise<StartRegistrationResult> {
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Please check the details.' };
  }
  const { name, email, phone, password, locale } = parsed.data;

  const problem = await newPasswordProblem(password, { email, phone, name });
  if (problem) return { ok: false, message: problem };

  return sendRegistrationCodes(email, {
    pendingName: name,
    pendingPhone: phone,
    pendingPasswordHash: await hashPassword(password),
    pendingLocale: locale,
  });
}

async function openRegistration(registrationId: string) {
  const challenge = await db.emailChallenge.findUnique({ where: { id: registrationId } });
  if (
    !challenge ||
    challenge.purpose !== 'REGISTER' ||
    challenge.consumedAt ||
    !challenge.pendingName ||
    !challenge.pendingPhone ||
    !challenge.pendingPasswordHash ||
    challenge.createdAt.getTime() < Date.now() - REGISTRATION_TTL_MINUTES * 60_000
  ) {
    return null;
  }
  return challenge;
}

/** Sends both codes again, for the same details. */
export async function resendRegistrationCodes(registrationId: string): Promise<StartRegistrationResult> {
  const challenge = await openRegistration(registrationId);
  if (!challenge) return { ok: false, message: 'This sign-up has expired. Please start again.' };
  return sendRegistrationCodes(challenge.email, {
    pendingName: challenge.pendingName!,
    pendingPhone: challenge.pendingPhone!,
    pendingPasswordHash: challenge.pendingPasswordHash!,
    pendingLocale: challenge.pendingLocale ?? 'en',
  });
}

export type CompleteRegistrationResult =
  | { ok: true; userId: string; role: string; created: boolean }
  | { ok: false; message: string; field?: 'emailCode' | 'smsCode' };

/**
 * Step two: both codes. Creates the family account - or, when the number
 * already has a family account from phone sign-in, adds email sign-in to it.
 */
export async function completeEmailRegistration(input: {
  registrationId: string;
  emailCode: string;
  smsCode: string;
}): Promise<CompleteRegistrationResult> {
  const challenge = await openRegistration(input.registrationId);
  if (!challenge) return { ok: false, message: 'This sign-up has expired. Please start again.' };

  const emailCheck = await checkEmailCode(challenge, input.emailCode);
  if (!emailCheck.ok) return { ok: false, message: `Email code: ${emailCheck.message}`, field: 'emailCode' };

  const phone = challenge.pendingPhone!;
  const smsCheck = await verifyOtp(phone, input.smsCode, 'REGISTER');
  if (!smsCheck.ok) return { ok: false, message: `Text message code: ${smsCheck.message}`, field: 'smsCode' };

  if (!(await consumeEmailCode(challenge.id))) {
    return { ok: false, message: 'This sign-up has expired. Please start again.' };
  }

  // Both proved: now it is safe to say who already has an account.
  const email = challenge.email;
  const [byEmail, byPhone] = await Promise.all([
    db.user.findUnique({ where: { email } }),
    db.user.findUnique({ where: { phone } }),
  ]);

  if (byEmail && byEmail.id !== byPhone?.id) {
    return { ok: false, message: 'This email already has an account. Sign in with it, or use “Forgot password?”.' };
  }

  if (byPhone) {
    if (!PASSWORD_ROLES.has(byPhone.role)) {
      return {
        ok: false,
        message: 'This number belongs to a staff account. Staff sign in with a phone code or a passkey.',
      };
    }
    if (byPhone.passwordHash && byPhone.email && byPhone.email !== email) {
      return {
        ok: false,
        message: `This number already signs in with ${maskEmail(byPhone.email)}. Use that email, or sign in with your phone.`,
      };
    }
    const changedAt = new Date();
    await db.$transaction([
      db.user.update({
        where: { id: byPhone.id },
        data: {
          email,
          emailVerifiedAt: changedAt,
          passwordHash: challenge.pendingPasswordHash,
          passwordChangedAt: changedAt,
        },
      }),
      // Replacing an existing password is a password change: sign out the rest.
      ...(byPhone.passwordHash
        ? [db.authSession.updateMany({ where: { userId: byPhone.id, revokedAt: null }, data: { revokedAt: changedAt } })]
        : []),
    ]);
    await audit({
      action: 'EMAIL_SIGN_IN_ADDED',
      entityType: 'User',
      entityId: byPhone.id,
      actorUserId: byPhone.id,
      actorRole: byPhone.role,
    });
    return { ok: true, userId: byPhone.id, role: byPhone.role, created: false };
  }

  const name = challenge.pendingName!;
  try {
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          phone,
          name,
          email,
          emailVerifiedAt: new Date(),
          passwordHash: challenge.pendingPasswordHash,
          passwordChangedAt: new Date(),
          role: 'CAREGIVER',
          locale: challenge.pendingLocale ?? 'en',
        },
      });
      await tx.family.create({
        data: {
          name: `${name.split(' ').slice(-1)[0]} family`,
          members: { create: [{ userId: created.id, role: 'PRIMARY_CAREGIVER' }] },
        },
      });
      return created;
    });
    await audit({
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      actorUserId: user.id,
      actorRole: user.role,
      detail: { event: 'account_created', role: user.role, method: 'email' },
    });
    return { ok: true, userId: user.id, role: user.role, created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ok: false, message: 'This email or number was registered a moment ago. Please sign in.' };
    }
    throw error;
  }
}

// --- sign-in -------------------------------------------------------------------

export type PasswordSignInResult =
  | { ok: true; userId: string; role: string }
  | { ok: false; message: string; locked?: boolean };

export async function signInWithPassword(rawEmail: string, password: string): Promise<PasswordSignInResult> {
  const email = normaliseEmail(rawEmail);
  if (!isValidEmail(email) || password.length === 0 || password.length > 1024) {
    return { ok: false, message: SIGN_IN_FAILED };
  }

  const emailHash = hashToken(`login-failure:${email}`);
  const since = () => new Date(Date.now() - LOCK_WINDOW_MINUTES * 60_000);
  const failures = () => db.loginFailure.count({ where: { emailHash, createdAt: { gte: since() } } });

  if ((await failures()) >= MAX_PASSWORD_FAILURES) return { ok: false, message: LOCKED, locked: true };
  // Count this attempt as a failure BEFORE checking it, so parallel guesses
  // cannot all slip under the limit; it is cleared if the password is right.
  const claim = await db.loginFailure.create({ data: { emailHash } });
  if ((await failures()) > MAX_PASSWORD_FAILURES) {
    await db.loginFailure.delete({ where: { id: claim.id } });
    return { ok: false, message: LOCKED, locked: true };
  }

  const user = await db.user.findUnique({ where: { email } });
  const eligible =
    user && user.isActive && user.passwordHash && user.emailVerifiedAt && PASSWORD_ROLES.has(user.role);
  const ok = eligible
    ? await verifyPassword(password, user.passwordHash!)
    : await verifyAgainstDummy(password);

  if (!ok || !user) return { ok: false, message: SIGN_IN_FAILED };

  await db.loginFailure.deleteMany({ where: { emailHash } });
  return { ok: true, userId: user.id, role: user.role };
}

// --- reset -----------------------------------------------------------------------

export type ResetRequestResult =
  | { ok: true; email: string; devCode?: string }
  | { ok: false; message: string };

/**
 * Sends a reset code if, and only if, the address belongs to a family account
 * with password sign-in. The answer is the same either way, and with `schedule`
 * set to run after the response, so is the time it takes.
 */
export async function requestPasswordReset(
  rawEmail: string,
  schedule: Schedule = now,
): Promise<ResetRequestResult> {
  const email = normaliseEmail(rawEmail);
  if (!isValidEmail(email)) return { ok: false, message: 'Enter a valid email address.' };

  const user = await db.user.findUnique({ where: { email } });
  const eligible = user && user.isActive && user.emailVerifiedAt && user.passwordHash && PASSWORD_ROLES.has(user.role);
  if (!eligible) return { ok: true, email };

  // A refusal here (cooldown, hourly budget) is not shown: it would tell a
  // stranger the address has an account. The owner's earlier code still works.
  const issued = await issueEmailCode(email, 'RESET');
  if (!issued.ok) return { ok: true, email };

  const simulated = getEmailProvider().mode === 'simulated';
  await schedule(() => deliver(issued.message));
  return { ok: true, email, ...(simulated ? { devCode: issued.code } : {}) };
}

export type ResetResult =
  | { ok: true; userId: string; role: string }
  | { ok: false; message: string; field?: 'code' | 'password' };

/** Sets a new password with a reset code. Signs out every device. */
export async function completePasswordReset(
  input: { email: string; code: string; password: string },
  schedule: Schedule = now,
): Promise<ResetResult> {
  const email = normaliseEmail(input.email);
  const invalid = { ok: false as const, message: 'That code is not valid any more. Please ask for a new one.', field: 'code' as const };

  const challenge = await db.emailChallenge.findFirst({
    where: { email, purpose: 'RESET', consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!challenge) return invalid;

  const check = await checkEmailCode(challenge, input.code);
  if (!check.ok) return { ok: false, message: check.message, field: 'code' };

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.isActive || !user.emailVerifiedAt || !PASSWORD_ROLES.has(user.role)) return invalid;

  const problem = await newPasswordProblem(input.password, { email, phone: user.phone, name: user.name });
  if (problem) return { ok: false, message: problem, field: 'password' };

  if (!(await consumeEmailCode(challenge.id))) return invalid;

  const passwordHash = await hashPassword(input.password);
  const changedAt = new Date();
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash, passwordChangedAt: changedAt } }),
    // Whoever knew the old password may be signed in somewhere: not any more.
    db.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: changedAt } }),
    db.loginFailure.deleteMany({ where: { emailHash: hashToken(`login-failure:${email}`) } }),
  ]);
  await audit({
    action: 'PASSWORD_RESET',
    entityType: 'User',
    entityId: user.id,
    actorUserId: user.id,
    actorRole: user.role,
    detail: { sessionsRevoked: true },
  });
  await schedule(() => deliver({ to: email, ...emailCopy.passwordChanged() }));
  return { ok: true, userId: user.id, role: user.role };
}
