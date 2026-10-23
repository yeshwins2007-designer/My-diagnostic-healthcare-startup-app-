/**
 * Placing a call.
 *
 * Live: ElevenLabs dials out through the connected phone number (Twilio or
 * SIP trunk) with the calls agent from lib/voice/agent.ts, passing the call's
 * brief as dynamic variables. The outcome comes back later, signed, to
 * app/api/voice/calls/webhook.
 *
 * Without a phone line nothing is dialled: the call is recorded as
 * SIMULATED, with the words it would have used, so a demo shows exactly what
 * the service would do and nobody's phone rings by accident.
 */

import { env, providerMode } from '../env';

export interface PlaceCallInput {
  callId: string;
  toPhone: string;
  dynamicVariables: Record<string, string>;
}

export type PlaceCallResult =
  | { ok: true; simulated: false; providerCallId: string }
  | { ok: true; simulated: true }
  | { ok: false; error: string };

export type Dialer = (input: PlaceCallInput) => Promise<PlaceCallResult>;

const liveDialer: Dialer = async ({ toPhone, dynamicVariables }) => {
  const path = env.ELEVENLABS_PHONE_PROVIDER === 'sip_trunk' ? 'sip-trunk' : 'twilio';
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/convai/${path}/outbound-call`, {
      method: 'POST',
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY ?? '', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: env.ELEVENLABS_CALLS_AGENT_ID,
        agent_phone_number_id: env.ELEVENLABS_PHONE_NUMBER_ID,
        to_number: toPhone,
        conversation_initiation_client_data: { dynamic_variables: dynamicVariables },
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; conversation_id?: string; message?: string };
    if (!res.ok || data.success === false || !data.conversation_id) {
      return { ok: false, error: data.message ?? `The phone line answered ${res.status}` };
    }
    return { ok: true, simulated: false, providerCallId: data.conversation_id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'The phone line could not be reached' };
  }
};

const simulatedDialer: Dialer = async () => ({ ok: true, simulated: true });

let override: Dialer | null = null;

/** Tests swap in their own phone line. */
export function setDialerForTests(dialer: Dialer | null) {
  override = dialer;
}

export function getDialer(): Dialer {
  return override ?? (providerMode.calls === 'live' ? liveDialer : simulatedDialer);
}
