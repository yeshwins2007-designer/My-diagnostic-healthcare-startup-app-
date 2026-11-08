/**
 * Passwords, for families who would rather sign in with an email address.
 *
 * Stored only as scrypt hashes: memory-hard, so a stolen database cannot be
 * cracked at GPU speed. The format names its own parameters, so they can be
 * raised later without breaking existing passwords.
 *
 * Kept free of 'server-only' and the database so the seed script can use it.
 */

import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

// N=2^15, r=8, p=3: one of OWASP's equivalent minimum settings for scrypt.
// About 32 MiB and a fraction of a second per hash, which is what makes each
// offline guess expensive. The stored format lets these be raised later.
const PARAMS = { N: 2 ** 15, r: 8, p: 3 } as const;
const KEY_LENGTH = 64;
const MAX_MEMORY = 128 * 1024 * 1024;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, {
    ...PARAMS,
    maxmem: MAX_MEMORY,
  });
  return `scrypt$${PARAMS.N},${PARAMS.r},${PARAMS.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, params, saltText, keyText] = stored.split('$');
  if (scheme !== 'scrypt' || !params || !saltText || !keyText) return false;
  const [N, r, p] = params.split(',').map(Number);
  if (!N || !r || !p) return false;
  const expected = Buffer.from(keyText, 'base64url');
  const actual = await scrypt(password.normalize('NFKC'), Buffer.from(saltText, 'base64url'), expected.length, {
    N,
    r,
    p,
    maxmem: MAX_MEMORY,
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | null = null;

/**
 * Burns the same time as a real check, for an address with no account. A
 * reply that came back faster for unknown addresses would tell an attacker
 * which addresses are registered.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword(crypto.randomBytes(18).toString('base64url'));
  await verifyPassword(password, await dummyHash);
  return false;
}

/**
 * Passwords that meet the length rule but are guessed first. Length rules out
 * the classic top-100; this catches the long ones people still choose.
 */
const COMMON = new Set([
  '123456789012',
  '1234567890123',
  '12345678901234',
  '123456789012345',
  '1234567890qwerty',
  '1q2w3e4r5t6y',
  '1q2w3e4r5t6y7u',
  'qwertyuiopasdf',
  'qwertyuiop12',
  'qwerty123456',
  'qwerty1234567',
  'password1234',
  'password12345',
  'password123456',
  'passwordpassword',
  'iloveyou1234',
  'iloveyouiloveyou',
  'abcdefghijkl',
  'abcd1234abcd',
  'abc123abc123',
  'welcome12345',
  'welcome@1234',
  'india1234567',
  'jaihind12345',
  'letmein12345',
  'trustno1trustno1',
  'changeme1234',
  'administrator',
  'administrator1',
]);

export interface PolicyContext {
  email?: string;
  phone?: string;
  name?: string;
}

/** Returns why a new password is not acceptable, or null if it is. */
export function passwordProblem(password: string, context: PolicyContext = {}): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters. Three or four words together is easy to remember.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  const lower = password.toLowerCase();
  const compact = lower.replace(/[\s._@!#-]/g, '');
  if (COMMON.has(lower) || COMMON.has(compact) || /^(.{1,4})\1+$/.test(compact)) {
    return 'That password is one of the first an attacker would try. Please choose another.';
  }
  if (lower.includes('medwyn')) {
    return 'Please do not use the name of this service in your password.';
  }
  const local = context.email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) {
    return 'Please do not use your email address in your password.';
  }
  const digits = context.phone?.replace(/\D/g, '').slice(-10);
  if (digits && digits.length === 10 && password.replace(/\D/g, '').includes(digits)) {
    return 'Please do not use your phone number in your password.';
  }
  const firstName = context.name?.trim().split(/\s+/)[0]?.toLowerCase();
  if (firstName && firstName.length >= 4 && compact.replace(/\d+/g, '') === firstName) {
    return 'Please do not use just your name. Add a few more words.';
  }
  return null;
}

/**
 * Has this password appeared in a public data breach? Breached passwords are
 * what credential-stuffing attacks try first, whatever their length.
 *
 * Uses Have I Been Pwned's k-anonymity range API: only the first five
 * characters of the password's SHA-1 leave this server, never the password or
 * its full hash. Fails open (returns false) if the service is unreachable, so
 * an outage there never blocks a family from signing up.
 */
export async function isBreachedPassword(password: string): Promise<boolean> {
  if (process.env.NODE_ENV === 'test' || process.env.PASSWORD_BREACH_CHECK === 'off') return false;
  const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'medwyn-password-check' },
      signal: AbortSignal.timeout(2500),
      cache: 'no-store',
    });
    if (!res.ok) return false;
    const body = await res.text();
    return body.split('\n').some((line) => {
      const [hashSuffix, count] = line.trim().split(':');
      return hashSuffix === suffix && Number(count) > 0;
    });
  } catch {
    return false;
  }
}
