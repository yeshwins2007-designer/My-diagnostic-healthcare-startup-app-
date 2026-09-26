/**
 * Rate limiting.
 *
 * Two endpoints are reachable without a session by design — the assistant and
 * the OTP request — and both write rows. These tests exist because "we added a
 * limiter" is worth nothing if the window never resets or the key is shared
 * across unrelated callers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit, clientKey, __resetRateLimits } from '@/lib/rate-limit';

beforeEach(() => __resetRateLimits());

describe('rateLimit', () => {
  it('allows up to the limit and refuses beyond it', () => {
    const opts = { limit: 3, windowSeconds: 60 };
    expect(rateLimit('a', opts).allowed).toBe(true);
    expect(rateLimit('a', opts).allowed).toBe(true);
    expect(rateLimit('a', opts).allowed).toBe(true);

    const refused = rateLimit('a', opts);
    expect(refused.allowed).toBe(false);
    expect(refused.remaining).toBe(0);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('counts down the remaining allowance', () => {
    const opts = { limit: 3, windowSeconds: 60 };
    expect(rateLimit('b', opts).remaining).toBe(2);
    expect(rateLimit('b', opts).remaining).toBe(1);
    expect(rateLimit('b', opts).remaining).toBe(0);
  });

  it('keeps separate callers separate', () => {
    const opts = { limit: 1, windowSeconds: 60 };
    expect(rateLimit('caller-1', opts).allowed).toBe(true);
    expect(rateLimit('caller-1', opts).allowed).toBe(false);
    // A different caller must not inherit the first one's exhausted budget.
    expect(rateLimit('caller-2', opts).allowed).toBe(true);
  });

  it('opens a new window once the old one expires', async () => {
    const opts = { limit: 1, windowSeconds: 1 };
    expect(rateLimit('c', opts).allowed).toBe(true);
    expect(rateLimit('c', opts).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(rateLimit('c', opts).allowed).toBe(true);
  });
});

describe('clientKey', () => {
  it('prefers the first x-forwarded-for hop', () => {
    const request = new Request('https://example.test', {
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
    });
    expect(clientKey(request, 'voice')).toBe('voice:203.0.113.7');
  });

  it('falls back to x-real-ip, then to a constant', () => {
    expect(
      clientKey(
        new Request('https://example.test', { headers: { 'x-real-ip': '198.51.100.4' } }),
        'otp',
      ),
    ).toBe('otp:198.51.100.4');

    expect(clientKey(new Request('https://example.test'), 'otp')).toBe('otp:unknown');
  });

  it('scopes keys so one endpoint cannot exhaust another', () => {
    const request = new Request('https://example.test', {
      headers: { 'x-real-ip': '198.51.100.4' },
    });
    expect(clientKey(request, 'voice')).not.toBe(clientKey(request, 'otp'));
  });
});
