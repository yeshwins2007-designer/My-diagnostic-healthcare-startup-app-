'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { z } from 'zod';
import { db } from '@/lib/db';
import { createSession, destroySession } from '@/lib/auth/session';
import { createUser, requestOtp, verifyOtp, normalisePhone } from '@/lib/auth/otp';
import { audit } from '@/lib/compliance/audit';
import { UserRole } from '@/lib/enums';
import { LOCALE_KEYS } from '@/lib/i18n/locales';
import { rateLimit } from '@/lib/rate-limit';

export interface AuthState {
  step: 'PHONE' | 'CODE' | 'PROFILE';
  phone?: string;
  message?: string;
  error?: string;
  /** Only ever populated when the SMS provider is simulated. */
  devCode?: string;
  /** Which sign-up path the visitor chose on /join. */
  intent?: 'individual' | 'business';
  /** Set when a cooldown or rate limit is in force. */
  retryAfterSeconds?: number;
}

const phoneSchema = z.object({
  phone: z.string().min(10),
  intent: z.enum(['individual', 'business']).default('individual'),
});

export async function sendCode(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  // The per-phone cooldown in requestOtp stops one number being spammed. It
  // does nothing about an attacker rotating numbers — spraying SMS at other
  // people's phones, at our expense — so limit the sender as well.
  const headerList = await headers();
  const ip =
    headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headerList.get('x-real-ip') ??
    'unknown';

  const limit = rateLimit(`otp:${ip}`, { limit: 10, windowSeconds: 600 });
  if (!limit.allowed) {
    return {
      step: 'PHONE',
      error: `Too many attempts. Please wait ${Math.ceil(limit.retryAfterSeconds / 60)} minutes, or call us.`,
      retryAfterSeconds: limit.retryAfterSeconds,
    };
  }

  const parsed = phoneSchema.safeParse({
    phone: String(formData.get('phone') ?? ''),
    intent: String(formData.get('intent') ?? 'individual'),
  });

  if (!parsed.success) {
    return { step: 'PHONE', error: 'Enter a valid 10-digit Indian mobile number.' };
  }

  const result = await requestOtp(parsed.data.phone);
  if (!result.ok) {
    return {
      step: 'PHONE',
      phone: parsed.data.phone,
      intent: parsed.data.intent,
      error: result.message,
    };
  }

  return {
    step: 'CODE',
    phone: normalisePhone(parsed.data.phone),
    intent: parsed.data.intent,
    message: result.message,
    devCode: result.devCode,
  };
}

const codeSchema = z.object({
  phone: z.string().min(10),
  code: z.string().regex(/^\d{6}$/, 'The code is six digits.'),
  intent: z.enum(['individual', 'business']).default('individual'),
});

export async function checkCode(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = codeSchema.safeParse({
    phone: String(formData.get('phone') ?? ''),
    code: String(formData.get('code') ?? '').trim(),
    intent: String(formData.get('intent') ?? 'individual'),
  });

  if (!parsed.success) {
    return {
      step: 'CODE',
      phone: String(formData.get('phone') ?? ''),
      intent: (String(formData.get('intent') ?? 'individual') as 'individual' | 'business'),
      error: 'The code is six digits.',
    };
  }

  const result = await verifyOtp(parsed.data.phone, parsed.data.code);
  if (!result.ok) {
    return {
      step: 'CODE',
      phone: parsed.data.phone,
      intent: parsed.data.intent,
      error: result.message,
    };
  }

  // Existing account: straight in.
  if (result.userId) {
    const agent = (await headers()).get('user-agent') ?? undefined;
    await createSession(result.userId, agent);

    const user = await db.user.findUniqueOrThrow({ where: { id: result.userId } });
    await audit({
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      actorUserId: user.id,
      actorRole: user.role,
    });

    redirect(homeFor(user.role));
  }

  // New account: collect a name (and, for a lab, we send them to the lab
  // application rather than a caregiver dashboard).
  return {
    step: 'PROFILE',
    phone: parsed.data.phone,
    intent: parsed.data.intent,
    message: 'Verified. One last thing.',
  };
}

const profileSchema = z.object({
  phone: z.string().min(10),
  name: z.string().min(2, 'Please enter a name.').max(120),
  locale: z.enum(LOCALE_KEYS as [string, ...string[]]).default('en'),
  intent: z.enum(['individual', 'business']).default('individual'),
});

export async function completeProfile(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = profileSchema.safeParse({
    phone: String(formData.get('phone') ?? ''),
    name: String(formData.get('name') ?? '').trim(),
    locale: String(formData.get('locale') ?? 'en'),
    intent: String(formData.get('intent') ?? 'individual'),
  });

  if (!parsed.success) {
    return {
      step: 'PROFILE',
      phone: String(formData.get('phone') ?? ''),
      intent: (String(formData.get('intent') ?? 'individual') as 'individual' | 'business'),
      error: parsed.error.issues[0]?.message ?? 'Please check the details.',
    };
  }

  const role: UserRole = parsed.data.intent === 'business' ? 'LAB' : 'CAREGIVER';
  const user = await createUser({
    phone: parsed.data.phone,
    name: parsed.data.name,
    role,
    locale: parsed.data.locale,
  });

  // A caregiver gets a family container immediately; a lab does not, because
  // its account only becomes meaningful once an application is submitted.
  if (role === 'CAREGIVER') {
    await db.family.create({
      data: {
        name: `${parsed.data.name.split(' ').slice(-1)[0]} family`,
        members: { create: [{ userId: user.id, role: 'PRIMARY_CAREGIVER' }] },
      },
    });
  }

  const agent = (await headers()).get('user-agent') ?? undefined;
  await createSession(user.id, agent);

  redirect(role === 'LAB' ? '/lab/apply' : '/caregiver/onboarding');
}

export async function signOut() {
  await destroySession();
  redirect('/');
}

function homeFor(role: string): string {
  switch (role) {
    case 'OPS':
      return '/ops';
    case 'LAB':
      return '/lab';
    case 'TECHNICIAN':
      return '/field';
    default:
      return '/caregiver';
  }
}
