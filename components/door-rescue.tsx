'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { reportNoAnswer } from '@/app/actions/field';
import { Button, Card, H3, Muted, Stack } from '@/components/ui';

export interface DoorCall {
  id: string;
  recipientRole: string;
  recipientName: string;
  status: string;
  doorResponse?: string;
  doorMessage?: string;
}

const RESPONSES: Record<string, string> = {
  coming: 'is coming to the door',
  not_home: 'says no one is home today. A coordinator will rearrange the visit',
  later: 'asked for another time. A coordinator will rearrange the visit',
};

function line(call: DoorCall) {
  const who = call.recipientName.split(' ')[0];
  switch (call.status) {
    case 'SCHEDULED':
    case 'DIALING':
      return `Calling ${who}…`;
    case 'COMPLETED':
      return call.doorResponse ? `${who} ${RESPONSES[call.doorResponse] ?? 'answered'}.` : `${who} answered.`;
    case 'NO_ANSWER':
      return `${who} didn’t pick up.`;
    case 'SIMULATED':
      return `Would call ${who} now. This demo has no phone line, so nothing was dialled.`;
    case 'CANCELLED':
      return `${who} wasn’t called: it was too late to help.`;
    default:
      return `Couldn’t reach ${who}.`;
  }
}

/**
 * At the door with no answer: one button, then the calls as they happen.
 * The screen refreshes itself while a call is in progress, so the
 * technician never has to guess whether to wait.
 */
export function DoorRescue({ bookingId, calls, familyPhone }: { bookingId: string; calls: DoorCall[]; familyPhone?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const live = calls.some((c) => c.status === 'SCHEDULED' || c.status === 'DIALING');

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [live, router]);

  return (
    <Card>
      <Stack gap="sm">
        <H3>No one at the door?</H3>
        {calls.length === 0 ? (
          <Muted>Wait a minute and ring again. Then tap below: we call the patient, then the family, while you wait.</Muted>
        ) : (
          <ul className="flex flex-col gap-2" aria-live="polite">
            {calls.map((c) => (
              <li key={c.id} className="flex flex-col gap-0.5">
                <span className="font-semibold">{line(c)}</span>
                {c.doorMessage && <span className="text-small text-[var(--color-ink-soft)]">“{c.doorMessage}”</span>}
              </li>
            ))}
          </ul>
        )}
        {calls.length === 0 && (
          <Button
            full
            tone="secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await reportNoAnswer(bookingId);
                setNotice(r.message ?? null);
                router.refresh();
              })
            }
          >
            No one is answering
          </Button>
        )}
        {notice && <p className="text-small font-semibold">{notice}</p>}
        {familyPhone && (
          <a href={`tel:${familyPhone}`} className="inline-flex min-h-11 items-center text-small font-semibold underline">
            Ring the family yourself
          </a>
        )}
      </Stack>
    </Card>
  );
}
