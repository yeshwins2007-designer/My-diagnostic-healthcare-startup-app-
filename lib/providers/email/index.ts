/**
 * Email delivery, for sign-up and password-reset codes.
 *
 * Same pattern as SMS: with no provider configured, messages are logged to
 * the server console and the code is shown on screen so the app works on a
 * clean checkout. The moment RESEND_API_KEY exists, real email takes over and
 * codes stop being echoed anywhere. In production a simulated provider turns
 * email sign-in off altogether (lib/env.ts, emailAuthEnabled).
 */

import { env, providerMode } from '../../env';
import { brand } from '../../brand';
import type { DeliveryResult } from '../sms';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailProvider {
  readonly mode: 'live' | 'simulated';
  send(message: EmailMessage): Promise<DeliveryResult>;
}

class ConsoleEmailProvider implements EmailProvider {
  readonly mode = 'simulated' as const;

  async send({ to, subject, text }: EmailMessage): Promise<DeliveryResult> {
    console.info(`\n  [simulated email] to ${to}\n  ${subject}\n  ${text.replace(/\n/g, '\n  ')}\n`);
    return { ok: true, simulated: true, providerRef: `sim_${Date.now()}` };
  }
}

class ResendEmailProvider implements EmailProvider {
  readonly mode = 'live' as const;

  async send({ to, subject, text }: EmailMessage): Promise<DeliveryResult> {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        return { ok: false, simulated: false, error: `Resend responded ${res.status}` };
      }
      const data = (await res.json()) as { id?: string };
      return { ok: true, simulated: false, providerRef: data.id };
    } catch (error) {
      return {
        ok: false,
        simulated: false,
        error: error instanceof Error ? error.message : 'Unknown email failure',
      };
    }
  }
}

let cached: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (!cached) {
    cached = providerMode.email === 'live' ? new ResendEmailProvider() : new ConsoleEmailProvider();
  }
  return cached;
}

/** The wording of each email, in one place. Plain text: no tracking, no links to phish with. */
export const emailCopy = {
  register: (code: string) => ({
    subject: `${code} is your ${brand.name} code`,
    text: `Your ${brand.name} code is ${code}. It expires in 10 minutes.\n\nEnter it to finish creating your account. If you did not ask for this, you can ignore this email: nothing happens without the code.`,
  }),
  reset: (code: string) => ({
    subject: `${code} is your ${brand.name} password reset code`,
    text: `Your ${brand.name} password reset code is ${code}. It expires in 10 minutes.\n\nIf you did not ask to reset your password, ignore this email. Your password stays the same, and nobody can change it without this code.`,
  }),
  passwordChanged: () => ({
    subject: `Your ${brand.name} password was changed`,
    text: `The password for your ${brand.name} account was just changed, and every device that was signed in has been signed out.\n\nIf this was not you, sign in with your phone number and call us at ${brand.supportPhone}.`,
  }),
};
