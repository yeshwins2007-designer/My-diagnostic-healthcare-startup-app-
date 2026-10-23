import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { recordCallResult } from '@/lib/voice/outcomes';
import { verifySignature } from '@/lib/voice/webhook';

/**
 * The result of one of the assistant's calls, from ElevenLabs once the call
 * ends (or fails to connect). Signed, checked before it is read, and matched
 * to the call it belongs to; anything else is acknowledged and ignored, so
 * the provider never retries a delivery we have chosen not to act on.
 */

interface Payload {
  type?: string;
  data?: {
    conversation_id?: string;
    failure_reason?: string;
    analysis?: { data_collection_results?: Record<string, unknown>; transcript_summary?: string };
  };
}

export async function POST(request: Request) {
  const secret = env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'Call results are not being accepted.' }, { status: 503 });

  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get('elevenlabs-signature') ?? '', secret)) {
    return NextResponse.json({ error: 'Signature does not match.' }, { status: 401 });
  }

  let body: Payload;
  try {
    body = JSON.parse(raw) as Payload;
  } catch {
    return NextResponse.json({ error: 'Not JSON.' }, { status: 400 });
  }

  const data = body.data ?? {};
  // Matched by the id ElevenLabs gave the call when we placed it, never by
  // anything the conversation itself carries.
  const providerCallId = data.conversation_id;

  if (body.type === 'post_call_transcription' && providerCallId) {
    // An inbound conversation matches no call of ours, and changes nothing.
    await recordCallResult({
      providerCallId,
      answered: true,
      data: data.analysis?.data_collection_results,
      summary: data.analysis?.transcript_summary,
    });
  } else if (body.type === 'call_initiation_failure' && providerCallId) {
    await recordCallResult({ providerCallId, answered: false, failureReason: data.failure_reason ?? 'unknown' });
  }

  return NextResponse.json({ ok: true });
}
