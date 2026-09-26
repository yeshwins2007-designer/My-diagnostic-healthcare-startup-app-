/**
 * Rate limiting.
 *
 * Two endpoints are reachable without a session, by design:
 *
 *   /api/voice/turn — the assistant must answer someone who has not signed in
 *   OTP requests    — you cannot require a session to start a session
 *
 * Both write rows. Without a limit, either is a way to flood the support queue,
 * fill the database, or spray SMS at other people's phone numbers at our
 * expense. The per-phone OTP cooldown is not enough on its own: an attacker
 * simply rotates the number.
 *
 * This is an in-process fixed-window counter. That is honest about its scope —
 * it protects a single instance, and a multi-instance deployment should move
 * it to Redis or the platform's own edge limiter. It is not a substitute for
 * one, but it is a great deal better than nothing.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Stops the map growing without bound on a long-lived process. */
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  options: { limit: number; windowSeconds: number },
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowSeconds * 1000 });
    return {
      allowed: true,
      remaining: options.limit - 1,
      retryAfterSeconds: options.windowSeconds,
    };
  }

  existing.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));

  if (existing.count > options.limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  return {
    allowed: true,
    remaining: options.limit - existing.count,
    retryAfterSeconds,
  };
}

/**
 * Best-effort client identity from proxy headers.
 *
 * These headers are trivially spoofable unless a trusted proxy sets them, so
 * this is a speed bump against casual abuse rather than an access control.
 * Anything that actually matters is behind a session or a signed token.
 */
export function clientKey(request: Request, scope: string): string {
  const headers = request.headers;
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || headers.get('x-real-ip') || 'unknown';
  return `${scope}:${ip}`;
}

/** Reset between tests. Not used in application code. */
export function __resetRateLimits() {
  buckets.clear();
}
