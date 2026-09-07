import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/auth/session';
import { audit } from '@/lib/compliance/audit';
import { guardInput, guardOutput } from '@/lib/providers/voice/guardrails';
import { simulatedReply } from '@/lib/providers/voice';
import { env, providerMode } from '@/lib/env';

/**
 * One conversational turn, guarded.
 *
 * Every utterance passes through `guardInput` before the agent answers and
 * `guardOutput` before anything is spoken back — in live mode as well as
 * simulated. When a guard trips, a human callback ticket is opened rather than
 * the caller being left with a refusal and nowhere to go.
 */

const turnSchema = z.object({
  conversationId: z.string().optional(),
  utterance: z.string().min(1).max(2000),
  /** In live mode the ElevenLabs agent supplies its draft reply for screening. */
  agentDraft: z.string().max(4000).optional(),
  locale: z.string().max(8).default('en'),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = turnSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const user = await getSessionUser();
  const { utterance, agentDraft, locale } = parsed.data;

  // 1. Screen what the caller said.
  const inbound = guardInput(utterance);

  let replyText: string;
  let intent: string;
  let guard = inbound;

  if (!inbound.allowed) {
    replyText = inbound.replacement ?? '';
    intent = inbound.isEmergency ? 'emergency' : `blocked:${inbound.category}`;
  } else if (providerMode.voice === 'live' && agentDraft) {
    // 2. Screen what the agent wants to say. This runs even when the question
    //    looked innocent: "how is my mother doing?" is not a clinical question,
    //    and "her numbers look a bit high" is a clinical answer.
    const outbound = guardOutput(agentDraft);
    guard = outbound;
    replyText = outbound.allowed ? agentDraft : (outbound.replacement ?? '');
    intent = outbound.allowed ? 'agent' : `blocked_output:${outbound.category}`;
  } else {
    const scripted = simulatedReply(utterance);
    // The simulator routes through the same guards, so a demo demonstrates the
    // real refusal behaviour rather than a mock of it.
    guard = scripted.guard;
    replyText = scripted.text;
    intent = scripted.intent;
  }

  // 3. Persist the conversation, with retention set at creation time.
  const conversation = parsed.data.conversationId
    ? await db.voiceConversation.update({
        where: { id: parsed.data.conversationId },
        data: {
          transcriptText: { set: undefined },
          guardrailTrips: guard.allowed ? undefined : { increment: 1 },
          handedOffToHuman: guard.requiresHandoff ? true : undefined,
        },
      })
    : await db.voiceConversation.create({
        data: {
          userId: user?.id ?? null,
          locale,
          consentNoticeGiven: true,
          guardrailTrips: guard.allowed ? 0 : 1,
          handedOffToHuman: guard.requiresHandoff,
          purgeAfter: new Date(Date.now() + env.TRANSCRIPT_RETENTION_DAYS * 86_400_000),
        },
      });

  await db.voiceConversation.update({
    where: { id: conversation.id },
    data: {
      transcriptText:
        `${conversation.transcriptText}\ncaller: ${utterance}\nagent: ${replyText}`.trim(),
    },
  });

  // 4. Open a human ticket when the guard demands one. A refusal without a
  //    route to a person is just a wall.
  let ticketId: string | null = null;
  if (guard.requiresHandoff) {
    const membership = user
      ? await db.familyMember.findFirst({ where: { userId: user.id } })
      : null;

    const ticket = await db.supportTicket.create({
      data: {
        familyId: membership?.familyId ?? null,
        raisedByUserId: user?.id ?? null,
        source: 'VOICE_AGENT',
        category: 'CLINICAL_HANDOFF',
        subject: guard.isEmergency
          ? 'URGENT — caller described a possible medical emergency'
          : 'Caller asked something clinical — coordinator callback needed',
        body: utterance,
        priority: guard.isEmergency ? 'URGENT' : 'HIGH',
      },
    });
    ticketId = ticket.id;

    await db.voiceConversation.update({
      where: { id: conversation.id },
      data: { ticketId },
    });

    await audit({
      action: guard.isEmergency ? 'VOICE_HANDED_OFF' : 'VOICE_GUARDRAIL_TRIPPED',
      entityType: 'VoiceConversation',
      entityId: conversation.id,
      actorUserId: user?.id ?? null,
      actorRole: 'SYSTEM',
      detail: {
        category: guard.category,
        matched: guard.matched,
        emergency: guard.isEmergency,
        ticketId,
      },
    });
  }

  return NextResponse.json({
    conversationId: conversation.id,
    reply: replyText,
    intent,
    blocked: !guard.allowed,
    category: guard.category ?? null,
    isEmergency: guard.isEmergency,
    handedOff: guard.requiresHandoff,
    ticketId,
    mode: providerMode.voice,
  });
}
