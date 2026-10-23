/**
 * Checking that a call result really came from ElevenLabs.
 *
 * The header is `ElevenLabs-Signature: t=<unix seconds>,v0=<hex>`, where the
 * hex is HMAC-SHA256 over `<t>.<raw body>` with the webhook's secret. A
 * forged result could close a ticket that should have opened (a parent who
 * didn't understand fasting) or smear a technician, so anything unsigned,
 * mis-signed or stale is refused before it is read.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const TOLERANCE_SECONDS = 30 * 60;

export function signBody(rawBody: string, secret: string, timestamp: number): string {
  return `t=${timestamp},v0=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
}

export function verifySignature(rawBody: string, header: string, secret: string, nowMs = Date.now()): boolean {
  const parts = new Map(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()] as const;
    }),
  );
  const t = Number(parts.get('t'));
  const given = parts.get('v0') ?? '';
  if (!Number.isFinite(t) || t <= 0 || !/^[0-9a-f]{64}$/i.test(given)) return false;
  if (Math.abs(nowMs / 1000 - t) > TOLERANCE_SECONDS) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(given, 'hex'));
}
