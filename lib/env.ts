/**
 * Environment and provider-mode resolution.
 *
 * Every external integration has a real implementation and a simulator. Which
 * one runs is decided here, purely by whether the relevant credentials exist.
 * That is what makes `npm run dev` work on a clean checkout with no keys, and
 * makes going live a matter of pasting into `.env.local` rather than editing
 * code.
 */

import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().default('file:./dev.db'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /**
   * The app's public address, e.g. https://app.medwyn.in. Passkeys are bound
   * to a domain: set this in production so they can only ever be used there.
   * Unset (previews, local), the request's own origin is used.
   */
  PUBLIC_APP_URL: z.string().url().optional(),

  /**
   * Set to "true" ONLY for a demo or preview. In production without it, the
   * server refuses to start while sign-in codes or payments would be
   * simulated: a simulated SMS gateway shows every login code on screen, which
   * would let anyone sign in as anyone, including staff with access to every
   * patient's records.
   */
  DEMO_MODE: z.enum(['true', 'false']).default('false'),

  /** Signing key for session JWTs and tracking-link tokens. */
  AUTH_SECRET: z.string().min(16).default('dev-only-insecure-secret-change-me'),
  /** AES-256-GCM key (64 hex chars) for field-level encryption of results. */
  FIELD_ENCRYPTION_KEY: z.string().optional(),

  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().optional(),
  GOOGLE_MAPS_SERVER_KEY: z.string().optional(),

  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  ELEVENLABS_API_KEY: z.string().optional(),
  NEXT_PUBLIC_ELEVENLABS_AGENT_ID: z.string().optional(),

  ABDM_CLIENT_ID: z.string().optional(),
  ABDM_CLIENT_SECRET: z.string().optional(),
  ABDM_ENV: z.enum(['sandbox', 'production']).default('sandbox'),

  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_SENDER_ID: z.string().optional(),

  /** Email delivery (Resend) for email sign-up and password reset codes. */
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('MEDWYN <no-reply@medwyn.in>'),

  /**
   * Brandfetch Logo Link client ID (free, from developers.brandfetch.com).
   * Shows each partner lab's own logo, found from its website domain. Unset,
   * labs get a monogram instead. Public by design: it is sent with every
   * logo request, and Brandfetch ties it to your allowed domains.
   */
  NEXT_PUBLIC_BRANDFETCH_CLIENT_ID: z.string().optional(),

  /**
   * The partner app's own host name, e.g. partners.medwyn.in. Requests to it
   * are served the lab portal at the root (/ is the terminal, /login the
   * partner sign-in), the way restaurants use a separate partner app. Unset,
   * the portal is at /lab on the main host, as it always is.
   */
  PARTNER_HOST: z.string().optional(),

  /** How long raw GPS pings survive before being collapsed to a summary. */
  PING_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  /** How long voice transcripts survive. */
  TRANSCRIPT_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  /** Collection-to-intake ceiling. The blueprint's hard sample rule. */
  SAMPLE_CLOCK_MINUTES: z.coerce.number().int().positive().default(120),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail loudly at boot rather than mysteriously at the first request.
  throw new Error(
    `Invalid environment configuration:\n${JSON.stringify(
      z.treeifyError(parsed.error),
      null,
      2,
    )}`,
  );
}

export const env = parsed.data;

/**
 * Which mode each integration is running in. Surfaced in the UI (a small
 * "simulated" chip) so nobody mistakes a demo payment for a real one.
 */
export const providerMode = {
  maps: env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? 'live' : 'simulated',
  payments: env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET ? 'live' : 'simulated',
  voice: env.ELEVENLABS_API_KEY ? 'live' : 'simulated',
  abdm: env.ABDM_CLIENT_ID && env.ABDM_CLIENT_SECRET ? 'live' : 'simulated',
  sms: env.MSG91_AUTH_KEY ? 'live' : 'simulated',
  email: env.RESEND_API_KEY ? 'live' : 'simulated',
} as const;

export type ProviderName = keyof typeof providerMode;

export function isSimulated(name: ProviderName): boolean {
  return providerMode[name] === 'simulated';
}

/** True when every integration is simulated — i.e. a clean demo checkout. */
export const isFullySimulated = Object.values(providerMode).every((m) => m === 'simulated');

const USING_DEFAULT_SECRET = env.AUTH_SECRET === 'dev-only-insecure-secret-change-me';

/**
 * Refuse to *serve* production traffic with the development signing secret. A
 * weak AUTH_SECRET would let anyone forge sessions and tracking links for
 * health records.
 *
 * The check deliberately exempts the build phase: `next build` runs with
 * NODE_ENV=production even on a laptop, and failing there would mean nobody
 * could compile the project without first inventing a production secret.
 * Deployment is when it has to hold, so that is where it throws.
 */
const IS_BUILD_PHASE = process.env.NEXT_PHASE === 'phase-production-build';

if (env.NODE_ENV === 'production' && USING_DEFAULT_SECRET) {
  if (IS_BUILD_PHASE) {
    console.warn(
      '\n  AUTH_SECRET is still the development default. The build will succeed, but the server will refuse to start until you set a real one:\n    openssl rand -base64 48\n',
    );
  } else {
    throw new Error(
      'AUTH_SECRET is still the development default. Generate one with `openssl rand -base64 48` and set it before serving production traffic.',
    );
  }
}

/** A deliberate demo or preview: simulators allowed, and labelled as such. */
export const isDemo = env.DEMO_MODE === 'true';

/**
 * Email + password sign-in is offered only where its codes can be trusted. A
 * simulated email provider shows password-reset codes on screen, which in
 * production would let anyone take over any account by its email address. So
 * in production it needs a real email provider (or an explicit demo); without
 * one, the Email option is simply not shown and phone sign-in carries on.
 */
export const emailAuthEnabled =
  providerMode.email === 'live' || isDemo || env.NODE_ENV !== 'production';

/**
 * Production must be real. Each condition below, left unchecked, is a way to
 * read or alter health records without being the person they belong to.
 * Enforced at boot rather than at first use, so a misconfigured deployment
 * fails before it ever serves a patient - and exempted during `next build`,
 * which runs as production on any laptop.
 */
if (env.NODE_ENV === 'production' && !IS_BUILD_PHASE) {
  const problems: string[] = [];
  if (!isDemo) {
    if (providerMode.sms === 'simulated') {
      problems.push(
        'No SMS gateway (MSG91_AUTH_KEY): sign-in codes would be shown on screen to anyone.',
      );
    }
    if (providerMode.payments === 'simulated') {
      problems.push(
        'No payment gateway (RAZORPAY_KEY_ID/SECRET): payments would be simulated and free.',
      );
    }
    if (providerMode.payments === 'live' && !env.RAZORPAY_WEBHOOK_SECRET) {
      problems.push('RAZORPAY_WEBHOOK_SECRET is missing: payment webhooks could not be verified.');
    }
    if (!env.PUBLIC_APP_URL) {
      problems.push('PUBLIC_APP_URL is missing: passkeys must be bound to the real domain.');
    }
  }
  if (!env.FIELD_ENCRYPTION_KEY) {
    problems.push(
      'FIELD_ENCRYPTION_KEY is missing: results would be encrypted with a key derived from AUTH_SECRET. Generate one with `openssl rand -hex 32`.',
    );
  }
  if (problems.length > 0) {
    throw new Error(
      `Refusing to serve production traffic:\n  - ${problems.join('\n  - ')}\n(For a demo or preview only, set DEMO_MODE=true.)`,
    );
  }
}
