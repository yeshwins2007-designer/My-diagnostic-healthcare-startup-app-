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
