'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { after } from 'next/server';
import { createSession } from '@/lib/auth/session';
import {
  completeEmailRegistration,
  completePasswordReset,
  requestPasswordReset,
  resendRegistrationCodes,
  signInWithPassword,
  startEmailRegistration,
  type Schedule,
  type StartRegistrationResult,
} from '@/lib/auth/email-auth';
import { audit } from '@/lib/compliance/audit';
import { emailAuthEnabled } from '@/lib/env';
import { clientIp, rateLimit } from '@/lib/rate-limit';

/**
 * Email sign-in, sign-up and reset, for the login screen. The rules live in
 * lib/auth/email-auth.ts; this adds per-sender limits, the session and the
 * redirect. Every export here is a public endpoint, so each one checks that
 * email sign-in is switched on before doing anything.
 */

const DISABLED = 'Email sign-in is not available. Please sign in with your phone number.';
const afterResponse: Schedule = (task) => after(task);

async function senderLimit(scope: string, limit: number) {
  const ip = clientIp(await headers());
  const result = rateLimit(`${scope}:${ip}`, { limit, windowSeconds: 600 });
  return result.allowed
    ? null
    : `Too many attempts. Please wait ${Math.ceil(result.retryAfterSeconds / 60)} minutes, or sign in with your phone.`;
}

const HOME: Record<string, string> = { OPS: '/ops', LAB: '/lab', TECHNICIAN: '/field' };

async function signInAs(userId: string, role: string, method: string) {
  await createSession(userId, (await headers()).get('user-agent') ?? undefined);
  await audit({
    action: 'USER_LOGIN',
    entityType: 'User',
    entityId: userId,
    actorUserId: userId,
    actorRole: role,
    detail: { method },
  });
}

const text = (formData: FormData, key: string) => String(formData.get(key) ?? '');

// --- sign in -------------------------------------------------------------------

export interface EmailSignInState {
  error?: string;
  email?: string;
}

export async function signInWithEmail(_prev: EmailSignInState, formData: FormData): Promise<EmailSignInState> {
  const email = text(formData, 'email').trim();
  if (!emailAuthEnabled) return { error: DISABLED, email };
  // Slows password spraying across many addresses from one sender; the
  // per-address lockout in the database is the real limit.
  const limited = await senderLimit('password', 30);
  if (limited) return { error: limited, email };

  const result = await signInWithPassword(email, text(formData, 'password'));
  if (!result.ok) return { error: result.message, email };

  await signInAs(result.userId, result.role, 'password');
  redirect(HOME[result.role] ?? '/caregiver');
}

// --- sign up -------------------------------------------------------------------

export interface EmailSignUpState {
  step: 'DETAILS' | 'CODES';
  error?: string;
  field?: 'emailCode' | 'smsCode';
  registrationId?: string;
  name?: string;
  email?: string;
  phone?: string;
  locale?: string;
  devEmailCode?: string;
  devSmsCode?: string;
}

function toState(result: StartRegistrationResult, fallback: EmailSignUpState): EmailSignUpState {
  if (!result.ok) return { ...fallback, error: result.message };
  return {
    step: 'CODES',
    registrationId: result.registrationId,
    // Kept so "Change my details" can refill the form (never the password).
    name: fallback.name,
    locale: fallback.locale,
    email: result.email,
    phone: result.phone,
    devEmailCode: result.devEmailCode,
    devSmsCode: result.devSmsCode,
  };
}

export async function beginEmailSignUp(_prev: EmailSignUpState, formData: FormData): Promise<EmailSignUpState> {
  // Never echo the password back: the rest is returned so the form keeps it.
  const details: EmailSignUpState = {
    step: 'DETAILS',
    name: text(formData, 'name'),
    email: text(formData, 'email'),
    phone: text(formData, 'phone'),
    locale: text(formData, 'locale') || 'en',
  };
  if (!emailAuthEnabled) return { ...details, error: DISABLED };
  // Shares the phone sign-in's budget: this sends a text message too.
  const limited = await senderLimit('otp', 10);
  if (limited) return { ...details, error: limited };

  const result = await startEmailRegistration({
    name: details.name!,
    email: details.email!,
    phone: details.phone!,
    password: text(formData, 'password'),
    locale: details.locale,
  });
  return toState(result, details);
}

export async function resendEmailSignUpCodes(prev: EmailSignUpState, formData: FormData): Promise<EmailSignUpState> {
  const registrationId = text(formData, 'registrationId');
  const current: EmailSignUpState = { ...prev, step: 'CODES', registrationId };
  if (!emailAuthEnabled) return { ...current, error: DISABLED };
  const limited = await senderLimit('otp', 10);
  if (limited) return { ...current, error: limited };
  return toState(await resendRegistrationCodes(registrationId), current);
}

export async function finishEmailSignUp(_prev: EmailSignUpState, formData: FormData): Promise<EmailSignUpState> {
  const current: EmailSignUpState = { step: 'CODES', registrationId: text(formData, 'registrationId') };
  if (!emailAuthEnabled) return { ...current, error: DISABLED };
  const limited = await senderLimit('codes', 30);
  if (limited) return { ...current, error: limited };

  const result = await completeEmailRegistration({
    registrationId: current.registrationId!,
    emailCode: text(formData, 'emailCode').trim(),
    smsCode: text(formData, 'smsCode').trim(),
  });
  if (!result.ok) return { ...current, error: result.message, field: result.field };

  await signInAs(result.userId, result.role, result.created ? 'email_signup' : 'email_added');
  redirect(result.created ? '/caregiver/onboarding' : '/caregiver');
}

// --- forgot password -----------------------------------------------------------

export interface PasswordResetState {
  step: 'EMAIL' | 'CODE';
  email?: string;
  error?: string;
  field?: 'code' | 'password';
  devCode?: string;
}

export async function sendPasswordResetCode(_prev: PasswordResetState, formData: FormData): Promise<PasswordResetState> {
  const email = text(formData, 'email').trim();
  if (!emailAuthEnabled) return { step: 'EMAIL', email, error: DISABLED };
  const limited = await senderLimit('reset', 10);
  if (limited) return { step: 'EMAIL', email, error: limited };

  // The email goes out after the response, so how long this takes does not
  // reveal whether the address has an account.
  const result = await requestPasswordReset(email, afterResponse);
  if (!result.ok) return { step: 'EMAIL', email, error: result.message };
  return { step: 'CODE', email: result.email, devCode: result.devCode };
}

export async function setNewPassword(_prev: PasswordResetState, formData: FormData): Promise<PasswordResetState> {
  const email = text(formData, 'email');
  const current: PasswordResetState = { step: 'CODE', email };
  if (!emailAuthEnabled) return { ...current, error: DISABLED };
  const limited = await senderLimit('codes', 30);
  if (limited) return { ...current, error: limited };

  const result = await completePasswordReset(
    { email, code: text(formData, 'code').trim(), password: text(formData, 'password') },
    afterResponse,
  );
  if (!result.ok) return { ...current, error: result.message, field: result.field };

  await signInAs(result.userId, result.role, 'password_reset');
  redirect(HOME[result.role] ?? '/caregiver');
}
