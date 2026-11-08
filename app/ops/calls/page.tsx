import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { requirePageRole } from '@/lib/auth/session';
import { markRequestCalledBack } from '@/app/actions/ops';
import { providerMode } from '@/lib/env';
import { callResultLine, callTitle } from '@/lib/voice/describe';
import { describeRequestedSlot } from '@/lib/voice/requests';
import { technicianQuality } from '@/lib/voice/quality';
import { Badge, Card, EmptyState, H1, H3, Lead, Muted, Page, Stack } from '@/components/ui';

export const metadata: Metadata = { title: 'Assistant calls' };
export const dynamic = 'force-dynamic';

const pct = (r: number | null) => (r === null ? 'n/a' : `${Math.round(r * 100)}%`);

/**
 * The assistant's work, for the people behind it: visits asked for by phone
 * that need a person, each technician as families saw them, and every call
 * of the past week with what came of it. Tickets the calls raised are in the
 * ordinary queue, so nothing waits here that also waits there.
 */
export default async function AssistantCallsPage() {
  await requirePageRole('OPS');
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [requests, quality, calls] = await Promise.all([
    db.voiceBookingRequest.findMany({
      where: { status: 'NEW' },
      include: { patient: true, family: true },
      orderBy: { createdAt: 'asc' },
    }),
    technicianQuality(new Date(Date.now() - 30 * 86_400_000)),
    db.voiceCall.findMany({
      where: { createdAt: { gte: weekAgo } },
      include: { booking: true },
      orderBy: { scheduledFor: 'desc' },
      take: 100,
    }),
  ]);
  const strangers = requests.filter((r) => !r.familyId);
  const families = requests.filter((r) => r.familyId);

  return (
    <Page wide>
      <Stack gap="lg">
        <Stack gap="sm">
          <H1>Assistant calls</H1>
          <Lead>
            What the assistant did this week, and what it handed to you.
            {providerMode.calls === 'simulated' && ' No phone line is connected, so calls are written down here and never dialled.'}
          </Lead>
        </Stack>

        <Stack gap="md">
          <H3>New callers who asked for a visit</H3>
          {strangers.length === 0 ? (
            <Muted>Nobody waiting. Callers we don’t know yet appear here, to ring back and sign up.</Muted>
          ) : (
            strangers.map((r) => (
              <Card key={r.id} tone="yellow">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <Stack gap="sm">
                    <p className="font-semibold">
                      {r.callerName || 'Caller'} · {r.callerPhone}
                    </p>
                    <Muted>
                      {describeRequestedSlot(r.preferredDate, r.windowStartHour)}
                      {r.testsRequested && ` · “${r.testsRequested}”`}
                      {r.addressNote && ` · ${r.addressNote}`}
                    </Muted>
                  </Stack>
                  <form action={markRequestCalledBack.bind(null, r.id)}>
                    <button type="submit" className="inline-flex min-h-11 items-center font-semibold underline">
                      I called them back
                    </button>
                  </form>
                </div>
              </Card>
            ))
          )}
          {families.length > 0 && (
            <Muted>
              {families.length} visit{families.length === 1 ? '' : 's'} asked for by phone {families.length === 1 ? 'is' : 'are'} waiting for the family
              to confirm in the app. They lapse after two days.
            </Muted>
          )}
        </Stack>

        <Stack gap="md">
          <H3>Technicians, as families saw them (30 days)</H3>
          {quality.every((q) => q.answers === 0) ? (
            <Muted>No check-in answers yet. They come from the after-visit call, for families who turned it on.</Muted>
          ) : (
            <Card>
              <table className="w-full text-left text-small">
                <thead className="text-[var(--color-ink-faint)]">
                  <tr>
                    <th className="py-2 pr-3 font-semibold">Technician</th>
                    <th className="py-2 pr-3 font-semibold">Answers</th>
                    <th className="py-2 pr-3 font-semibold">On time</th>
                    <th className="py-2 pr-3 font-semibold">Gentle</th>
                    <th className="py-2 font-semibold">Early warning</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {quality.map((q) => (
                    <tr key={q.technicianId} className="border-t border-[var(--color-line)]">
                      <td className="py-2 pr-3 font-semibold">{q.name}</td>
                      <td className="py-2 pr-3">{q.answers}</td>
                      <td className="py-2 pr-3">{pct(q.onTimeRate)}</td>
                      <td className="py-2 pr-3">{pct(q.gentleRate)}</td>
                      <td className="py-2">{q.flagged ? <Badge tone="red">{q.reasons.join('; ')}</Badge> : <Muted>None</Muted>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </Stack>

        <Stack gap="md">
          <H3>Calls this week</H3>
          {calls.length === 0 ? (
            <EmptyState title="No calls yet" body="Calls appear here once families turn them on and something is due." />
          ) : (
            <Card>
              <ul className="flex flex-col divide-y divide-[var(--color-line)]">
                {calls.map((c) => (
                  <li key={c.id} className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0" data-call={c.kind}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold">
                        {callTitle(c.kind)}
                        {c.booking && <span className="font-normal text-[var(--color-ink-faint)]"> · {c.booking.reference}</span>}
                      </span>
                      <span className="text-small text-[var(--color-ink-faint)]">
                        {c.scheduledFor.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
                      </span>
                    </div>
                    <span className="text-small">{callResultLine(c)}</span>
                    <span className="text-small text-[var(--color-ink-faint)]">
                      To {c.recipientName} ({c.recipientRole === 'PATIENT' ? 'parent' : 'family'}) in {c.locale}, attempt {c.attempts} of {c.maxAttempts}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </Stack>
      </Stack>
    </Page>
  );
}
