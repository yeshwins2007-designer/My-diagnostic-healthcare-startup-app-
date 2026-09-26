/**
 * Phone + OTP.
 *
 * This is how India actually logs in, and it is the only flow that works for a
 * caregiver standing in an airport at 2 AM who has never set a password for
 * this service. Codes are stored hashed, single-use, attempt-capped and
 * short-lived.
 */

import 'server-only';
import { db } from '../db';
import { generateOtp, hashToken, safeEqual } from '../compliance/crypto';
import { getSmsProvider } from '../providers/sms';
import { audit } from '../compliance/audit';
import type { UserRole } from '../enums';

const OTP_TTL_MINUTES = 10;
/** Stops one phone number being used to spray codes at another. */
const RESEND_COOLDOWN_SECONDS = 30;

export interface OtpRequestResult {
  ok: boolean;
  message: string;
  /**
   * Present only when the SMS provider is simulated, so the demo is usable
   * without an SMS gateway. Never populated when a real provider is live.
   */
  devCode?: string;
  retryAfterSeconds?: number;
}

export function normalisePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (input.startsWith('+')) return `+${digits}`;
  return `+${digits}`;
}

export function isValidIndianPhone(phone: string): boolean {
  return /^\+91[6-9]\d{9}$/.test(phone);
}

export async function requestOtp(
  rawPhone: string,
  purpose = 'LOGIN',
): Promise<OtpRequestResult> {
  const phone = normalisePhone(rawPhone);
  if (!isValidIndianPhone(phone)) {
    return { ok: false, message: 'Enter a valid 10-digit Indian mobile number.' };
  }

  const recent = await db.otpChallenge.findFirst({
    where: { phone, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (recent) {
    const elapsed = (Date.now() - recent.createdAt.getTime()) / 1000;
    if (elapsed < RESEND_COOLDOWN_SECONDS) {
      return {
        ok: false,
        message: 'A code was just sent. Please wait a moment before asking for another.',
        retryAfterSeconds: Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed),
      };
    }
    // Supersede the old code so only one is ever live per phone and purpose.
    await db.otpChallenge.update({
      where: { id: recent.id },
      data: { consumedAt: new Date() },
    });
  }

  const code = generateOtp();
  await db.otpChallenge.create({
    data: {
      phone,
      purpose,
      codeHash: hashToken(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
    },
  });

  const sms = getSmsProvider();
  const delivery = await sms.sendOtp(phone, code);

  return {
    ok: true,
    message: `We sent a 6-digit code to ${phone}.`,
    ...(delivery.simulated ? { devCode: code } : {}),
  };
}

export interface OtpVerifyResult {
  ok: boolean;
  message: string;
  userId?: string;
  isNewUser?: boolean;
}

export async function verifyOtp(
  rawPhone: string,
  code: string,
  purpose = 'LOGIN',
): Promise<OtpVerifyResult> {
  const phone = normalisePhone(rawPhone);

  const challenge = await db.otpChallenge.findFirst({
    where: { phone, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!challenge) {
    return { ok: false, message: 'Ask for a new code — this one is no longer valid.' };
  }
  if (challenge.expiresAt < new Date()) {
    return { ok: false, message: 'That code has expired. Please ask for a new one.' };
  }
  if (challenge.attempts >= challenge.maxAttempts) {
    return { ok: false, message: 'Too many attempts. Please ask for a new code.' };
  }

  if (!safeEqual(hashToken(code.trim()), challenge.codeHash)) {
    await db.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    const left = challenge.maxAttempts - challenge.attempts - 1;
    return {
      ok: false,
      message:
        left > 0
          ? `That code did not match. ${left} ${left === 1 ? 'try' : 'tries'} left.`
          : 'That code did not match. Please ask for a new code.',
    };
  }

  await db.otpChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() },
  });

  const existing = await db.user.findUnique({ where: { phone } });
  return {
    ok: true,
    message: 'Verified.',
    userId: existing?.id,
    isNewUser: !existing,
  };
}

/** Used after a successful OTP on the sign-up path. */
export async function createUser(input: {
  phone: string;
  name: string;
  role: UserRole;
  locale?: string;
  email?: string;
}) {
  const user = await db.user.create({
    data: {
      phone: normalisePhone(input.phone),
      name: input.name.trim(),
      role: input.role,
      locale: input.locale ?? 'en',
      email: input.email ?? null,
    },
  });

  await audit({
    action: 'USER_LOGIN',
    entityType: 'User',
    entityId: user.id,
    actorUserId: user.id,
    actorRole: user.role,
    detail: { event: 'account_created', role: user.role },
  });

  return user;
}
