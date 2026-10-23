import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { safeEqual } from '@/lib/compliance/crypto';
import { getToolSpec, isPermittedTool } from '@/lib/providers/voice/tools';
import {
  callbackAnswer,
  callerFromPhone,
  callerFromUser,
  etaAnswer,
  fastingAnswer,
  nextVisitAnswer,
  planAnswer,
  reportStatusAnswer,
  requestVisitAnswer,
  verifyCallerSession,
  type Caller,
} from '@/lib/voice/answers';

/**
 * The phone agent's tools. ElevenLabs calls these mid-conversation with the
 * shared secret in a header, and with who is calling: the number they rang
 * from (`caller`, from {{system__caller_id}}) or, in the app, a signed
 * session (`session`). A tool name that is not on the reviewed list is
 * refused before anything is looked up, and no tool here can read a result.
 */

async function identify(url: URL): Promise<Caller> {
  const session = url.searchParams.get('session');
  const userId = session ? verifyCallerSession(session) : null;
  if (userId) {
    const caller = await callerFromUser(userId);
    if (caller) return caller;
  }
  return callerFromPhone(url.searchParams.get('caller') ?? '');
}

async function handle(request: Request, name: string) {
  const secret = env.ELEVENLABS_TOOL_SECRET;
  if (!secret) return NextResponse.json({ error: 'Tools are switched off.' }, { status: 503 });
  if (!safeEqual(request.headers.get('x-medwyn-tool-secret') ?? '', secret)) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 401 });
  }
  if (!isPermittedTool(name)) return NextResponse.json({ error: 'No such tool.' }, { status: 404 });

  const url = new URL(request.url);
  const raw =
    request.method === 'GET'
      ? Object.fromEntries([...url.searchParams].filter(([k]) => k !== 'caller' && k !== 'session'))
      : await request.json().catch(() => ({}));
  const parsed = getToolSpec(name)!.input.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Those details did not make sense.' }, { status: 400 });
  // Each tool's own schema has just checked these.
  const args = parsed.data as Record<string, unknown>;
  const caller = await identify(url);

  let result: string;
  switch (name) {
    case 'get_next_visit':
      result = await nextVisitAnswer(caller, (args as { patient_name?: string }).patient_name);
      break;
    case 'get_technician_eta':
      result = await etaAnswer(caller);
      break;
    case 'get_fasting_instructions':
      result = await fastingAnswer(caller);
      break;
    case 'get_report_status':
      result = await reportStatusAnswer(caller);
      break;
    case 'get_plan_and_billing':
      result = await planAnswer(caller);
      break;
    case 'request_home_visit':
      result = await requestVisitAnswer(caller, args as Parameters<typeof requestVisitAnswer>[1]);
      break;
    case 'reschedule_visit': {
      const a = args as { booking_reference: string; preferred_date: string; preferred_window?: string };
      result = await callbackAnswer(
        caller,
        `Move ${a.booking_reference} to ${a.preferred_date}${a.preferred_window ? `, ${a.preferred_window}` : ''}.`,
        'NORMAL',
        'SCHEDULING',
      );
      result = `I've passed that on. ${result} They will confirm the new time by message.`;
      break;
    }
    case 'raise_support_ticket': {
      const a = args as { category: string; subject: string; detail?: string };
      result = await callbackAnswer(caller, `${a.subject}\n${a.detail ?? ''}`, a.category === 'COMPLAINT' ? 'HIGH' : 'NORMAL', a.category);
      break;
    }
    case 'request_human_callback': {
      const a = args as { reason: string; urgency: 'NORMAL' | 'HIGH' | 'URGENT' };
      result = await callbackAnswer(caller, a.reason, a.urgency);
      break;
    }
    default:
      return NextResponse.json({ error: 'No such tool.' }, { status: 404 });
  }
  return NextResponse.json({ result });
}

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  return handle(request, (await params).name);
}

export async function POST(request: Request, { params }: { params: Promise<{ name: string }> }) {
  return handle(request, (await params).name);
}
