/**
 * SMS / WhatsApp delivery.
 *
 * With no gateway configured, messages are logged to the server console and
 * the OTP is surfaced in the UI so the whole app is usable on a clean
 * checkout. The moment MSG91_AUTH_KEY exists, the real provider takes over and
 * the code stops being echoed anywhere.
 */

import { env, providerMode } from '../../env';

export interface DeliveryResult {
  ok: boolean;
  simulated: boolean;
  providerRef?: string;
  error?: string;
}

export interface SmsProvider {
  readonly mode: 'live' | 'simulated';
  sendOtp(phone: string, code: string): Promise<DeliveryResult>;
  sendMessage(phone: string, body: string): Promise<DeliveryResult>;
  /** WhatsApp is a first-class intake channel, not a nicety. */
  sendWhatsApp(phone: string, body: string): Promise<DeliveryResult>;
}

class ConsoleSmsProvider implements SmsProvider {
  readonly mode = 'simulated' as const;

  async sendOtp(phone: string, code: string): Promise<DeliveryResult> {
    console.info(`\n  [simulated SMS] to ${phone}\n  Your ${'SwasthaSetu'} code is ${code}. It expires in 10 minutes.\n`);
    return { ok: true, simulated: true, providerRef: `sim_${Date.now()}` };
  }

  async sendMessage(phone: string, body: string): Promise<DeliveryResult> {
    console.info(`\n  [simulated SMS] to ${phone}\n  ${body}\n`);
    return { ok: true, simulated: true, providerRef: `sim_${Date.now()}` };
  }

  async sendWhatsApp(phone: string, body: string): Promise<DeliveryResult> {
    console.info(`\n  [simulated WhatsApp] to ${phone}\n  ${body}\n`);
    return { ok: true, simulated: true, providerRef: `sim_${Date.now()}` };
  }
}

class Msg91Provider implements SmsProvider {
  readonly mode = 'live' as const;

  private async post(path: string, payload: unknown): Promise<DeliveryResult> {
    try {
      const res = await fetch(`https://control.msg91.com/api/v5/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authkey: env.MSG91_AUTH_KEY ?? '',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        return { ok: false, simulated: false, error: `MSG91 responded ${res.status}` };
      }
      const data = (await res.json()) as { request_id?: string };
      return { ok: true, simulated: false, providerRef: data.request_id };
    } catch (error) {
      return {
        ok: false,
        simulated: false,
        error: error instanceof Error ? error.message : 'Unknown SMS failure',
      };
    }
  }

  async sendOtp(phone: string, code: string): Promise<DeliveryResult> {
    return this.post('flow', {
      sender: env.MSG91_SENDER_ID,
      mobiles: phone.replace('+', ''),
      OTP: code,
    });
  }

  async sendMessage(phone: string, body: string): Promise<DeliveryResult> {
    return this.post('flow', {
      sender: env.MSG91_SENDER_ID,
      mobiles: phone.replace('+', ''),
      MESSAGE: body,
    });
  }

  async sendWhatsApp(phone: string, body: string): Promise<DeliveryResult> {
    return this.post('whatsapp/whatsapp-outbound-message', {
      integrated_number: env.MSG91_SENDER_ID,
      recipient_number: phone.replace('+', ''),
      content_type: 'text',
      text: body,
    });
  }
}

let cached: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (!cached) {
    cached = providerMode.sms === 'live' ? new Msg91Provider() : new ConsoleSmsProvider();
  }
  return cached;
}
