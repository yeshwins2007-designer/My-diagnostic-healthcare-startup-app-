/**
 * Voice provider.
 *
 * Live mode issues a short-lived conversation token so the browser can open a
 * WebRTC session with ElevenLabs without ever seeing the API key. Simulated
 * mode runs a scripted assistant through the *same* guardrails, so the safety
 * behaviour visible in a demo is the real behaviour, not a mock of it.
 */

import { env, providerMode } from '../../env';
import { guardInput, type GuardVerdict } from './guardrails';
import { AGENT_FIRST_MESSAGE } from './prompt';

export interface ConversationToken {
  /** Passed to the ElevenLabs React SDK. */
  token?: string;
  agentId?: string;
  simulated: boolean;
  firstMessage: string;
  error?: string;
}

export interface SimulatedReply {
  text: string;
  guard: GuardVerdict;
  /** Which scripted intent matched, for the transcript. */
  intent: string;
}

export interface VoiceProvider {
  readonly mode: 'live' | 'simulated';
  /** Token for a browser session. Never returns the API key itself. */
  getConversationToken(): Promise<ConversationToken>;
  /** Text-to-speech for the "read this to me" button in Elder Mode. */
  synthesize(text: string, locale: string): Promise<{ audioBase64?: string; simulated: boolean }>;
}

class ElevenLabsVoiceProvider implements VoiceProvider {
  readonly mode = 'live' as const;

  async getConversationToken(): Promise<ConversationToken> {
    const agentId = env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
    if (!agentId) {
      return {
        simulated: false,
        firstMessage: AGENT_FIRST_MESSAGE,
        error:
          'ELEVENLABS_API_KEY is set but NEXT_PUBLIC_ELEVENLABS_AGENT_ID is not. Run `npm run provision:voice` to create the agent.',
      };
    }

    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
        { headers: { 'xi-api-key': env.ELEVENLABS_API_KEY ?? '' } },
      );
      if (!res.ok) {
        return {
          simulated: false,
          firstMessage: AGENT_FIRST_MESSAGE,
          error: `ElevenLabs returned ${res.status}`,
        };
      }
      const data = (await res.json()) as { token: string };
      return { token: data.token, agentId, simulated: false, firstMessage: AGENT_FIRST_MESSAGE };
    } catch (error) {
      return {
        simulated: false,
        firstMessage: AGENT_FIRST_MESSAGE,
        error: error instanceof Error ? error.message : 'Unknown voice failure',
      };
    }
  }

  async synthesize(text: string, locale: string) {
    try {
      const res = await fetch(
        'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM',
        {
          method: 'POST',
          headers: {
            'xi-api-key': env.ELEVENLABS_API_KEY ?? '',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            // Multilingual model: the Indian-language coverage lives here.
            model_id: 'eleven_multilingual_v2',
            language_code: locale,
          }),
        },
      );
      if (!res.ok) return { simulated: false };
      const buffer = Buffer.from(await res.arrayBuffer());
      return { audioBase64: buffer.toString('base64'), simulated: false };
    } catch {
      return { simulated: false };
    }
  }
}

class SimulatedVoiceProvider implements VoiceProvider {
  readonly mode = 'simulated' as const;

  async getConversationToken(): Promise<ConversationToken> {
    return { simulated: true, firstMessage: AGENT_FIRST_MESSAGE };
  }

  async synthesize() {
    // The browser falls back to the Web Speech API, which is present on every
    // modern phone and speaks Indian languages passably.
    return { simulated: true };
  }
}

let cached: VoiceProvider | null = null;

export function getVoiceProvider(): VoiceProvider {
  if (!cached) {
    cached =
      providerMode.voice === 'live'
        ? new ElevenLabsVoiceProvider()
        : new SimulatedVoiceProvider();
  }
  return cached;
}

// --- the simulated conversation ---------------------------------------------

/**
 * A small scripted assistant used when no ElevenLabs key is configured. It is
 * routed through the real `guardInput`, so a demo genuinely demonstrates the
 * refusal behaviour rather than pretending to.
 */
const SCRIPTED_INTENTS: { intent: string; patterns: RegExp[]; reply: string }[] = [
  {
    intent: 'next_visit',
    patterns: [/next\s*visit/i, /when.*(?:coming|visit)/i, /appointment/i, /कब\s*आ/, /agli\s*visit/i],
    reply:
      'Your next visit is on Tuesday the fourteenth, between six thirty and seven thirty in the morning. Priya will be coming, the same technician as last month. Would you like me to move it?',
  },
  {
    intent: 'eta',
    patterns: [/where\s*(?:is|are)/i, /how\s*(?:far|long)/i, /eta/i, /कहाँ\s*(?:है|हैं)/, /kitni\s*der/i],
    reply:
      'Priya is about twelve minutes away and is inside your promised window. I can send you the live tracking link on WhatsApp if that helps.',
  },
  {
    intent: 'fasting',
    patterns: [/fast(?:ing)?/i, /eat|drink|khana|khali\s*pet/i, /खाली\s*पेट|उपवास/],
    reply:
      'For tomorrow, please finish dinner by eight thirty in the evening. After that, plain water is completely fine, and please do keep drinking water. Do not stop any regular medicine unless the doctor has told you to.',
  },
  {
    intent: 'reschedule',
    patterns: [/reschedul/i, /change.*(?:date|time|visit)/i, /postpone/i, /badal|badlna/i, /बदल/],
    reply:
      'I can move that. I have Wednesday the fifteenth at six thirty to seven thirty, or Thursday the sixteenth at seven thirty to eight thirty. Which suits you better?',
  },
  {
    intent: 'report_status',
    patterns: [/report.*(?:ready|come|status)/i, /where.*report/i, /रिपोर्ट\s*(?:आ|तैयार)/],
    reply:
      'The report was signed by the laboratory’s pathologist yesterday evening and released to your account. It is in the app under Reports, and the printed card was handed over at the visit. Your doctor is the right person to go through it with you.',
  },
  {
    intent: 'billing',
    patterns: [/plan|price|cost|bill|payment|subscription/i, /कितना|पैसे|भुगतान/],
    reply:
      'You are on Suraksha, at one thousand seven hundred and ninety nine rupees a month. It includes a monthly home visit with the same technician, the quarterly baseline panel, and a family call within twenty four hours of every report. Your next payment is on the first.',
  },
  {
    intent: 'complaint',
    patterns: [/complain|late|rude|unhappy|problem/i, /शिकायत|देर\s*हो/],
    reply:
      'I am sorry — that should not have happened. I am opening a ticket and a coordinator will call you back today. Can you tell me briefly what went wrong, so I can put it in the ticket in your words?',
  },
];

export function simulatedReply(utterance: string): SimulatedReply {
  const guard = guardInput(utterance);

  // The guard runs first and outranks every scripted intent — exactly as it
  // does in live mode.
  if (!guard.allowed) {
    return {
      text: guard.replacement ?? '',
      guard,
      intent: guard.isEmergency ? 'emergency' : `blocked:${guard.category}`,
    };
  }

  for (const candidate of SCRIPTED_INTENTS) {
    if (candidate.patterns.some((p) => p.test(utterance))) {
      return { text: candidate.reply, guard, intent: candidate.intent };
    }
  }

  return {
    text: 'I can help with the next visit, where the technician is, fasting instructions, moving a visit, whether a report has been released, or your plan and billing. Which of those would you like?',
    guard,
    intent: 'fallback',
  };
}
