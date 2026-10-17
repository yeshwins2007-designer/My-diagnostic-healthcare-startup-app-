/**
 * Proof that this browser just verified a phone number.
 *
 * Signing up is two steps: verify the code, then give a name. Without a proof
 * carried between them, the second step trusted whatever phone number the
 * form posted, so anyone could create the account for someone else's number
 * (and pick its role) without ever receiving that number's code. When the
 * real owner later signed in, they would land in an account an attacker set
 * up.
 *
 * So a correct code for a number with no account issues a short-lived, signed,
 * httpOnly cookie naming that number. Creating the account requires it, for
 * the same number, and spends it.
 */

import 'server-only';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../env';

const COOKIE_NAME = env.NODE_ENV === 'production' ? '__Host-ss_phone_proof' : 'ss_phone_proof';
const AUDIENCE = 'phone-proof';
const MINUTES = 15;

const secret = new TextEncoder().encode(env.AUTH_SECRET);

export async function issuePhoneProof(phone: string): Promise<void> {
  const expiresAt = new Date(Date.now() + MINUTES * 60_000);
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(phone)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret);

  (await cookies()).set(COOKIE_NAME, jwt, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

/** The verified phone number, or null if there is no valid proof. */
export async function readPhoneProof(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'], audience: AUDIENCE });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function clearPhoneProof(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}
