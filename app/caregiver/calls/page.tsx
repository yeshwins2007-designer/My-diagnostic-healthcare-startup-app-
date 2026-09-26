import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { loadCallHistory, loadFamilyContext } from '@/lib/queries/caregiver';
import { urgency, FOLLOW_UP_QUESTIONS } from '@/lib/sop/followUp';
import {
  Badge,
  Card,
  EmptyState,
  H1,
  H3,
  Lead,
  Muted,
  Page,
  Stack,
} from '@/components/ui';

export const metadata: Metadata = { title: 'Our calls to you' };
export const dynamic = 'force-dynamic';

/**
 * The call record, shown to the family rather than kept internally.
 *
 * The 24-hour follow-up call is the step the blueprint says drives most of
 * retention. Showing families that it happened — and what they told us — is
 * how a promise becomes visible rather than asserted. It also makes a missed
 * call impossible to hide.
 */
export default async function CallsPage() {
  const { family } = await loadFamilyContext();
  if (!family) redirect('/caregiver/onboarding');

  const calls = await loadCallHistory(family.id);
  const pending = calls.filter((c) => c.status === 'PENDING');
  const completed = calls.filter((c) => c.status === 'COMPLETED');
  const missed = calls.filter((c) => c.status === 'MISSED');

  return (
    <Page>
      <Stack gap="lg">
        <Stack gap="sm">
          <H1>Our calls to you</H1>
          <Lead>
            We call within 24 hours of every report. Every time. Here is the record — including
            any we owe you.
          </Lead>
        </Stack>

        {pending.length > 0 && (
          <Stack gap="md">
            <H3>Owed to you</H3>
            {pending.map((call) => {
              const u = urgency(call.dueBy);
              return (
                <Card key={call.id} tone={u.level === 'OVERDUE' ? 'red' : 'yellow'}>
                  <Stack gap="sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-semibold">
                        About {call.report.patient.name}’s report
                      </p>
                      <Badge tone={u.level === 'OVERDUE' ? 'red' : 'yellow'}>{u.label}</Badge>
                    </div>
                    {u.level === 'OVERDUE' && (
                      <Muted>
                        We are late on this one. That is our failure, not a queue you need to
                        join — a coordinator will call, and you can always call us first.
                      </Muted>
                    )}
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        )}

        {missed.length > 0 && (
          <Card tone="red">
            <Stack gap="sm">
              <H3>Calls we missed</H3>
              <Muted>
                {missed.length} call{missed.length === 1 ? '' : 's'} passed the 24-hour window
                without being made. We show these rather than quietly closing them.
              </Muted>
            </Stack>
          </Card>
        )}

        <Stack gap="md">
          <H3>Calls we made</H3>
          {completed.length === 0 ? (
            <EmptyState
              title="No calls yet"
              body="Once a report is released, a call is scheduled automatically and appears here after we have made it."
            />
          ) : (
            completed.map((call) => (
              <Card key={call.id}>
                <Stack gap="sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <p className="font-semibold">
                      {call.report.patient.name}’s report
                    </p>
                    <Muted>
                      {call.completedAt?.toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'long',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                      {call.placedBy && ` · ${call.placedBy.name}`}
                    </Muted>
                  </div>

                  {call.whatWorriedYou && (
                    <div>
                      <p className="font-semibold">{FOLLOW_UP_QUESTIONS[0]}</p>
                      <p className="text-[var(--color-ink-soft)]">{call.whatWorriedYou}</p>
                    </div>
                  )}
                  {call.whatWouldImprove && (
                    <div>
                      <p className="font-semibold">{FOLLOW_UP_QUESTIONS[1]}</p>
                      <p className="text-[var(--color-ink-soft)]">{call.whatWouldImprove}</p>
                    </div>
                  )}
                </Stack>
              </Card>
            ))
          )}
        </Stack>

        <Card tone="sunken">
          <Stack gap="sm">
            <H3>Why we ask the same two questions every time</H3>
            <Muted>
              They are the cheapest research this business will ever get, and they are read
              before anything gets built or changed. If something worried you and we never hear
              it, we will keep doing it.
            </Muted>
          </Stack>
        </Card>
      </Stack>
    </Page>
  );
}
