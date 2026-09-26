/**
 * Field-level encryption for the values we are least willing to leak:
 * individual result values, and anything else that turns a row in a database
 * dump into a person's diagnosis.
 *
 * AES-256-GCM, random 12-byte IV per value, auth tag stored alongside. Format
 * is `v1.<iv>.<tag>.<ciphertext>`, all base64url, so the scheme is versioned
 * and a future key rotation can be detected rather than guessed.
 */

import crypto from 'node:crypto';
import { env } from '../env';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';

/**
 * In development with no key configured we derive a deterministic key from
 * AUTH_SECRET so the app runs on a clean checkout. `assertProductionKey()`
 * refuses to let that reach production.
 */
function key(): Buffer {
  if (env.FIELD_ENCRYPTION_KEY) {
    const raw = Buffer.from(env.FIELD_ENCRYPTION_KEY, 'hex');
    if (raw.length !== 32) {
      throw new Error('FIELD_ENCRYPTION_KEY must be 64 hex characters (32 bytes).');
    }
    return raw;
  }
  return crypto.createHash('sha256').update(`fieldkey:${env.AUTH_SECRET}`).digest();
}

export function assertProductionKey(): void {
  if (env.NODE_ENV === 'production' && !env.FIELD_ENCRYPTION_KEY) {
    throw new Error(
      'FIELD_ENCRYPTION_KEY is required in production. Generate one with: openssl rand -hex 32',
    );
  }
}

export function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptField(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split('.');
  if (version !== VERSION) {
    throw new Error(`Unsupported ciphertext version: ${version}`);
  }
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key(),
    Buffer.from(ivB64, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Decryption that returns a placeholder instead of throwing. Used on list
 * screens, where one unreadable value must not blank out an entire report.
 */
export function tryDecryptField(payload: string): string | null {
  try {
    return decryptField(payload);
  } catch {
    return null;
  }
}

/** OTP codes and tracking tokens are stored hashed, never in plaintext. */
export function hashToken(token: string): string {
  return crypto.createHmac('sha256', env.AUTH_SECRET).update(token).digest('hex');
}

/** Constant-time compare, so a token check cannot be timed. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Six digits. Short enough to read aloud over a phone to an 80-year-old. */
export function generateOtp(): string {
  return String(crypto.randomInt(100_000, 1_000_000));
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** SS-7K3F2A — short, unambiguous when read over the phone. */
export function bookingReference(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O/1/I
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return `SS-${out}`;
}
