/**
 * Sessions.
 *
 * A signed JWT in an httpOnly cookie, backed by an AuthSession row purely so
 * a session can be revoked before it expires — a lost phone or a technician
 * leaving should not mean waiting thirty days for access to health records to
 * lapse.
 */

import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import { db } from '../db';
import { env } from '../env';
import { randomToken } from '../compliance/crypto';
import type { UserRole } from '../enums';

// __Host- in production: the browser then refuses the cookie unless it is
// Secure, host-only and path=/, so no subdomain can plant or override it.
const COOKIE_NAME = env.NODE_ENV === 'production' ? '__Host-ss_session' : 'ss_session';

/**
 * How long a sign-in lasts. A family stays signed in for a month - re-entering
 * a code every day is how elderly families give up. Staff see every patient's
 * records, so a lost ops or lab laptop must stop being a key by the next shift.
 */
const SESSION_HOURS: Record<string, number> = {
  CAREGIVER: 30 * 24,
  OPS: 12,
  LAB: 12,
  TECHNICIAN: 12,
};
const DEFAULT_SESSION_HOURS = 12;

const secret = new TextEncoder().encode(env.AUTH_SECRET);

export interface SessionUser {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  locale: string;
}

interface Claims {
  sub: string;
  role: UserRole;
  jti: string;
}

export async function createSession(
  userId: string,
  userAgent?: string,
): Promise<void> {
  const tokenId = randomToken(16);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const hours = SESSION_HOURS[user.role] ?? DEFAULT_SESSION_HOURS;
  const expiresAt = new Date(Date.now() + hours * 3_600_000);

  await db.authSession.create({
    data: { userId, tokenId, userAgent: userAgent ?? null, expiresAt },
  });

  const jwt = await new SignJWT({ role: user.role as UserRole, jti: tokenId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret);

  const jar = await cookies();
  jar.set(COOKIE_NAME, jwt, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
      const jti = (payload as unknown as Claims).jti;
      if (jti) {
        await db.authSession.updateMany({
          where: { tokenId: jti, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    } catch {
      // An unverifiable token is already useless; just clear it.
    }
  }

  jar.delete(COOKIE_NAME);
}

/** Returns null rather than throwing, so public pages can call it freely. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  let claims: Claims;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    claims = payload as unknown as Claims;
  } catch {
    return null;
  }

  // The revocation check is the reason the AuthSession table exists.
  const session = await db.authSession.findUnique({
    where: { tokenId: claims.jti },
    select: { revokedAt: true, expiresAt: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;

  const user = await db.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, name: true, phone: true, role: true, locale: true, isActive: true },
  });
  if (!user || !user.isActive) return null;

  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role as UserRole,
    locale: user.locale,
  };
}

export class AuthorisationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorisationError';
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthorisationError('Sign in to continue.');
  return user;
}

export async function requireRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new AuthorisationError(
      `This area is for ${roles.join(' or ').toLowerCase()} accounts.`,
    );
  }
  return user;
}

/**
 * For pages: the role check, done by the page itself. A layout's check is not
 * an access control - layouts do not re-run on client navigation, and a page
 * segment can be rendered without its layout - so every page that reads
 * protected data checks for itself, close to the data.
 */
export async function requirePageRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!roles.includes(user.role)) redirect('/');
  return user;
}
