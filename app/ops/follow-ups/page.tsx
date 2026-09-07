import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { urgency, FOLLOW_UP_QUESTIONS } from '@/lib/sop/followUp';
import { FollowUpForm } from '@/components/follow-up-form';
import {
  Badge,
  Card,
  EmptyState,
  H1,
  H2,
  H3,
  Lead,
  Muted,
  Page,
  Stack,
} from '@/components/ui';

export const metadata: Metadata = { title: 'Follow-up calls' };
export const dynamic = 'force-dynamic';

/**
 * "Call every family 24 hours after their report. Ask two questions: what
 * worried you, and what would make you do this every month?"
 *
 * This single step drives most of retention, so the target is 100% and there is
 * no way to tick it off without recording the two answers.
 */
export default async function FollowUpsPage() {
  const [pending, recent] = await Promise.all([
    db.followUpCall.findMany({
      where: { status: 'PENDING' },
      orderBy: { dueBy: 'asc' },
      include: {
        report: {
          include: {
            patient: {
              include: { family: { include: { members: { include: { user: true } } } } },
            },
          },
        },
        booking: { include: { technician: { include: { user: true } } } },
      },
    }),
    db.followUpCall.findMany({
      where: { status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      take: 8,
      include: { report: { include: { patient: true } } },
    }),
  ]);

  const overdue = pending.filter((c) => urgency(c.dueBy).level === 'OVERDUE');

  return (
    <Page wide>
      <Stack gap="lg">
        <Stack gap="sm">
          <H1>Follow-up calls</H1>
          <Lead>
            Within 24 hours of every report. Every time. This single step drives most of your
            retention — there is no acceptable completion rate below 100%.
          </Lead>
          {overdue.length > 0 && (
            <Badge tone="red">
              {overdue.length} overdue — call {overdue.length === 1 ? 'it' : 'them'} before
              anything else on this page
            </Badge>
          )}
        </Stack>

        {pending.length === 0 ? (
          <EmptyState
            title="No calls outstanding"
            body="A follow-up task is created automatically the moment a report is released, and it stays here until both questions have an answer."
          />
        ) : (
          <Stack gap="md">
            {pending.map((call) => {
              const caregiver = call.report.patient.family.members[0]?.user;
              const u = urgency(call.dueBy);
              return (
                <Card
                  key={call.id}
                  tone={u.level === 'OVERDUE' ? 'red' : u.level === 'DUE_SOON' ? 'yellow' : 'surface'}
                >
                  <Stack gap="md">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <H3>{call.report.patient.name}</H3>
                      <Badge
                        tone={
                          u.level === 'OVERDUE'
                            ? 'red'
                            : u.level === 'DUE_SOON'
                              ? 'yellow'
                              : 'neutral'
                        }
                      >
                        {u.label}
                      </Badge>
                    </div>

                    <Muted>
                      Call <strong>{caregiver?.name}</strong> on{' '}
                      <a href={`tel:${caregiver?.phone}`} className="underline">
                        {caregiver?.phone}
                      </a>{' '}
                      · report released{' '}
                      {call.report.releasedAt?.toLocaleString('en-IN') ?? '—'} · visited by{' '}
                      {call.booking.technician?.user.name ?? 'unassigned'}
                    </Muted>

                    <FollowUpForm callId={call.id} questions={[...FOLLOW_UP_QUESTIONS]} />
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        )}

        {recent.length > 0 && (
          <Stack gap="md">
            <H2>What families have been telling us</H2>
            <Muted>
              The two answers are the cheapest research this business will ever get. Read them
              before deciding what to build or fix next.
            </Muted>
            {recent.map((call) => (
              <Card key={call.id} tone="sunken">
                <Stack gap="sm">
                  <H3 className="text-[var(--text-lead)]">{call.report.patient.name}</H3>
                  <p>
                    <strong>What worried you?</strong> {call.whatWorriedYou || '—'}
                  </p>
                  <p>
                    <strong>What would make you do this every month?</strong>{' '}
                    {call.whatWouldImprove || '—'}
                  </p>
                  <Muted>Called {call.completedAt?.toLocaleString('en-IN')}</Muted>
                </Stack>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </Page>
  );
}
