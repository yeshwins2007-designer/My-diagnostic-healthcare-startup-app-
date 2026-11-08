import 'server-only';
import { cookies } from 'next/headers';
import { db } from '../db';
import { env, isDemo } from '../env';
import { hashToken, randomToken } from '../compliance/crypto';

/**
 * Elder Mode access: a device-bound key instead of a password.
 *
 * The family creates a private link in Profile and opens it once on the
 * parent's phone. Opening it swaps the link's token for a fresh device key
 * that lives only in that phone's httpOnly cookie, so the link itself is dead
 * the moment it has been used - forwarded, screenshotted or intercepted, it
 * opens nothing. Unopened links expire after a week. The family can turn any
 * device off from Profile.
 */

export const ELDER_COOKIE =
  env.NODE_ENV === 'production' ? '__Host-ss_elder' : 'ss_elder';
const LINK_TTL_DAYS = 7;
const DEVICE_TTL_DAYS = 180;

/**
 * Seeded demo data may be shown without a key only in an explicit demo
 * (DEMO_MODE=true). Secure by default: a developer's machine behaves like
 * production unless told otherwise.
 */
export const allowDemoData = isDemo;

/** Creates a one-time link token for a patient. Returns the raw token, once. */
export async function issueElderLink(patientId: string, createdByUserId: string) {
  const token = randomToken(32);
  const access = await db.elderAccess.create({
    data: { patientId, createdByUserId, tokenHash: hashToken(token) },
  });
  return { token, accessId: access.id };
}

/**
 * Redeems a link: the link token stops working and a new device key is set
 * as a cookie. Returns false for an unknown, used, expired or revoked link.
 */
export async function redeemElderLink(linkToken: string): Promise<boolean> {
  const access = await db.elderAccess.findUnique({ where: { tokenHash: hashToken(linkToken) } });
  const expired =
    !access ||
    access.revokedAt !== null ||
    access.openedAt !== null ||
    access.createdAt.getTime() < Date.now() - LINK_TTL_DAYS * 86_400_000;
  if (expired) return false;

  const deviceKey = randomToken(32);
  // Conditional update: two racing opens cannot both get a key.
  const swapped = await db.elderAccess.updateMany({
    where: { id: access.id, openedAt: null, revokedAt: null },
    data: { tokenHash: hashToken(deviceKey), openedAt: new Date(), lastUsedAt: new Date() },
  });
  if (swapped.count === 0) return false;

  const jar = await cookies();
  jar.set(ELDER_COOKIE, deviceKey, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DEVICE_TTL_DAYS * 86_400,
  });
  return true;
}

/** The patient this device may see in Elder Mode, or null. */
export async function elderPatientId(): Promise<string | null> {
  const jar = await cookies();
  const key = jar.get(ELDER_COOKIE)?.value;
  if (!key) return null;

  const access = await db.elderAccess.findUnique({ where: { tokenHash: hashToken(key) } });
  if (!access || access.revokedAt || !access.openedAt) return null;
  if (access.openedAt.getTime() < Date.now() - DEVICE_TTL_DAYS * 86_400_000) return null;

  // Touch at most hourly: a read must not turn into a write on every visit.
  if (!access.lastUsedAt || access.lastUsedAt.getTime() < Date.now() - 3_600_000) {
    await db.elderAccess.update({ where: { id: access.id }, data: { lastUsedAt: new Date() } });
  }
  return access.patientId;
}
