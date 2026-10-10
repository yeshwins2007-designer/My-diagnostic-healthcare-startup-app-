'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransport,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { brand } from '@/lib/brand';
import { audit } from '@/lib/compliance/audit';
import { createSession, getSessionUser, requireUser } from '@/lib/auth/session';
import { clientIp, rateLimit } from '@/lib/rate-limit';

/**
 * Passkeys: sign in with Face ID, Touch ID, a fingerprint or the phone's
 * screen lock.
 *
 * A passkey is added only by someone already signed in with their phone code,
 * so it can never be the way an account is taken over - it is a faster key to
 * a door the code already opened. Challenges are stored, expire in five
 * minutes and are deleted on first use, so a captured response is worthless.
 */

const CHALLENGE_TTL_MS = 5 * 60_000;

/** Where passkeys are bound: the configured public URL, else this request's origin. */
async function relyingParty(): Promise<{ origin: string; rpID: string }> {
  if (env.PUBLIC_APP_URL) {
    const url = new URL(env.PUBLIC_APP_URL);
    return { origin: url.origin, rpID: url.hostname };
  }
  const h = await headers();
  const origin =
    h.get('origin') ??
    `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  return { origin, rpID: new URL(origin).hostname };
}

async function storeChallenge(challenge: string, purpose: 'REGISTER' | 'LOGIN', userId?: string) {
  // Expired challenges are swept on the way in; nothing else needs them.
  await db.passkeyChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.passkeyChallenge.create({
    data: { challenge, purpose, userId, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) },
  });
}

/** Finds and deletes the challenge a response was signed over. Single use. */
async function consumeChallenge(clientDataJSON: string, purpose: 'REGISTER' | 'LOGIN') {
  let challenge: string;
  try {
    challenge = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8')).challenge;
  } catch {
    return null;
  }
  const row = await db.passkeyChallenge.findUnique({ where: { challenge } });
  if (!row) return null;
  await db.passkeyChallenge.delete({ where: { id: row.id } });
  if (row.purpose !== purpose || row.expiresAt < new Date()) return null;
  return row;
}

function deviceLabel(userAgent: string): string {
  if (/iPhone/i.test(userAgent)) return 'iPhone';
  if (/iPad/i.test(userAgent)) return 'iPad';
  if (/Android/i.test(userAgent)) return 'Android phone';
  if (/Macintosh/i.test(userAgent)) return 'Mac';
  if (/Windows/i.test(userAgent)) return 'Windows computer';
  return 'This device';
}

export type PasskeyResult = { ok: true; redirectTo?: string } | { ok: false; message: string };

// --- adding a passkey (signed in) --------------------------------------------

export async function passkeyRegistrationOptions(): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const user = await requireUser();
  const { rpID } = await relyingParty();
  const existing = await db.passkey.findMany({ where: { userId: user.id } });

  const options = await generateRegistrationOptions({
    rpName: brand.name,
    rpID,
    userName: user.phone,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({
      id: p.credentialId,
      transports: p.transports ? (p.transports.split(',') as AuthenticatorTransport[]) : undefined,
    })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
  await storeChallenge(options.challenge, 'REGISTER', user.id);
  return options;
}

export async function verifyPasskeyRegistration(
  response: RegistrationResponseJSON,
): Promise<PasskeyResult> {
  const user = await requireUser();
  const row = await consumeChallenge(response.response.clientDataJSON, 'REGISTER');
  if (!row || row.userId !== user.id) {
    return { ok: false, message: 'That took too long. Please try adding the passkey again.' };
  }

  const { origin, rpID } = await relyingParty();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: row.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch {
    return { ok: false, message: 'The passkey could not be verified. Please try again.' };
  }
  if (!verification.verified) {
    return { ok: false, message: 'The passkey could not be verified. Please try again.' };
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const agent = (await headers()).get('user-agent') ?? '';
  const passkey = await db.passkey.create({
    data: {
      userId: user.id,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: (credential.transports ?? []).join(','),
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      label: deviceLabel(agent),
    },
  });

  await audit({
    action: 'PASSKEY_ADDED',
    entityType: 'User',
    entityId: user.id,
    actorUserId: user.id,
    actorRole: user.role,
    detail: { passkeyId: passkey.id, deviceType: credentialDeviceType },
  });
  revalidatePath('/caregiver/profile');
  return { ok: true };
}

export async function removePasskey(passkeyId: string): Promise<void> {
  const user = await requireUser();
  const deleted = await db.passkey.deleteMany({ where: { id: passkeyId, userId: user.id } });
  if (deleted.count > 0) {
    await audit({
      action: 'PASSKEY_REMOVED',
      entityType: 'User',
      entityId: user.id,
      actorUserId: user.id,
      actorRole: user.role,
      detail: { passkeyId },
    });
  }
  revalidatePath('/caregiver/profile');
}

// --- signing in with a passkey -------------------------------------------------

/**
 * Sign-in is reachable without a session and writes a challenge row, so it is
 * limited per client: enough for a family tapping twice, not enough to fill
 * the table or grind at verification.
 */
async function passkeyLimit(scope: string) {
  const ip = clientIp(await headers());
  return rateLimit(`passkey-${scope}:${ip}`, { limit: 20, windowSeconds: 600 });
}

export async function passkeyLoginOptions(): Promise<PublicKeyCredentialRequestOptionsJSON> {
  if (!(await passkeyLimit('options')).allowed) {
    throw new Error('Too many passkey attempts. Please wait a few minutes, or use your phone code.');
  }
  const { rpID } = await relyingParty();
  // No allowCredentials: the phone offers whichever passkey it holds for this
  // site, so nobody has to type their number first.
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' });
  await storeChallenge(options.challenge, 'LOGIN');
  return options;
}

const HOME: Record<string, string> = { OPS: '/ops', LAB: '/lab', TECHNICIAN: '/field' };

export async function verifyPasskeyLogin(response: AuthenticationResponseJSON): Promise<PasskeyResult> {
  const failed = { ok: false as const, message: 'That passkey did not work. Please sign in with your phone code.' };
  if (!(await passkeyLimit('verify')).allowed) {
    return { ok: false, message: 'Too many passkey attempts. Please wait a few minutes, or use your phone code.' };
  }

  const row = await consumeChallenge(response.response.clientDataJSON, 'LOGIN');
  if (!row) return { ok: false, message: 'That took too long. Please try again.' };

  const passkey = await db.passkey.findUnique({ where: { credentialId: response.id }, include: { user: true } });
  if (!passkey || !passkey.user.isActive) return failed;

  const { origin, rpID } = await relyingParty();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: row.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(passkey.publicKey),
        counter: passkey.counter,
        transports: passkey.transports
          ? (passkey.transports.split(',') as AuthenticatorTransport[])
          : undefined,
      },
      requireUserVerification: false,
    });
  } catch {
    return failed;
  }
  if (!verification.verified) return failed;

  await db.passkey.update({
    where: { id: passkey.id },
    data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
  });

  const agent = (await headers()).get('user-agent') ?? undefined;
  await createSession(passkey.userId, agent);
  await audit({
    action: 'USER_LOGIN',
    entityType: 'User',
    entityId: passkey.userId,
    actorUserId: passkey.userId,
    actorRole: passkey.user.role,
    detail: { method: 'passkey', passkeyId: passkey.id },
  });

  return { ok: true, redirectTo: HOME[passkey.user.role] ?? '/caregiver' };
}

/** For Profile: the signed-in person's passkeys. */
export async function listMyPasskeys() {
  const user = await getSessionUser();
  if (!user) return [];
  return db.passkey.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true, backedUp: true },
  });
}
