import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  loadFamilyContext,
  loadUpcomingVisits,
  loadReportTimeline,
} from '@/lib/queries/caregiver';
import { db } from '@/lib/db';
import { formatINR } from '@/lib/money';
import { fastingInstruction } from '@/lib/sop/visitWindow';
import { urgency } from '@/lib/sop/followUp';
import {
  Badge,
  ButtonLink,
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

export const metadata: Metadata = { title: 'Home' };
export const dynamic = 'force-dynamic';

function timeLabel(d: Date) {
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}
function dateLabel(d: Date) {
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default async function CaregiverHome() {
  const { session, family } = await loadFamilyContext();
  if (!family) redirect('/caregiver/onboarding');
  if (family.patients.length === 0) redirect('/caregiver/onboarding');

  const [visits, reports, pendingCall] = await Promise.all([
    loadUpcomingVisits(family.id),
    loadReportTimeline(family.id),
    db.followUpCall.findFirst({
      where: { status: 'PENDING', booking: { familyId: family.id } },
      orderBy: { dueBy: 'asc' },
    }),
  ]);

  const next = visits[0];
  const latestReport = reports[0];
  const openCritical = reports.find((r) => r.criticals.some((c) => c.status !== 'CLOSED'));

  return (
    <Page>
      <Stack gap="lg">
        <Stack gap="sm">
          <H1>Good to see you, {session.name.split(' ')[0]}</H1>
          <Lead>
            {family.patients.map((p) => `${p.name}, ${p.ageYears}`).join(' · ')}
          </Lead>
        </Stack>

        {/* A flagged result outranks everything else on the screen. */}
        {openCritical && (
          <Card tone="red">
            <Stack gap="sm">
              <Badge tone="red">Needs urgent medical attention</Badge>
              <H2 className="text-[var(--text-h3)]">
                {openCritical.patient.name}’s laboratory flagged a result
              </H2>
              <p>
                Please contact their doctor today. We have already called you, and we will call
                again to check that you reached someone.
              </p>
              <Muted>
                We cannot explain what the result means — only a doctor can. The signed report
                is below.
              </Muted>
              <ButtonLink href={`/caregiver/reports/${openCritical.id}`} tone="danger">
                Open the report
              </ButtonLink>
            </Stack>
          </Card>
        )}

        {next ? (
          <Card tone="primary">
            <Stack gap="md">
              <Badge tone="primary">Next visit</Badge>
              <H2 className="text-[var(--text-h3)]">
                {next.patient.name} · {dateLabel(next.windowStart)}
              </H2>
              <p className="text-[var(--text-lead)]">
                Between <strong>{timeLabel(next.windowStart)}</strong> and{' '}
                <strong>{timeLabel(next.windowEnd)}</strong>
              </p>
              {next.technician && (
                <p>
                  <strong>{next.technician.user.name}</strong> is coming — the same technician
                  as last time.
                </p>
              )}
              {next.fastingRequired && (
                <Card tone="yellow" className="p-4">
                  <p>{fastingInstruction(next.fastingHours, next.windowStart)}</p>
                </Card>
              )}
              <div className="flex flex-wrap gap-3">
                {(next.status === 'EN_ROUTE' || next.status === 'ARRIVED') && (
                  <ButtonLink href={`/caregiver/track/${next.id}`}>
                    See where they are
                  </ButtonLink>
                )}
                <ButtonLink href="/caregiver/visits" tone="secondary">
                  All visits
                </ButtonLink>
              </div>
            </Stack>
          </Card>
        ) : (
          <EmptyState
            title="No visit scheduled"
            body="Your plan schedules visits automatically. If you need one sooner, book it here."
            action={<ButtonLink href="/caregiver/visits">Book a visit</ButtonLink>}
          />
        )}

        {pendingCall && (
          <Card tone="info">
            <Stack gap="sm">
              <H3>We owe you a call</H3>
              <p>
                We call every family within 24 hours of a report. Yours is{' '}
                {urgency(pendingCall.dueBy).label.toLowerCase()}.
              </p>
              <Muted>
                If you would rather we called at a particular time, tell the assistant at the
                bottom of the screen and we will move it.
              </Muted>
            </Stack>
          </Card>
        )}

        {latestReport && (
          <Card>
            <Stack gap="sm">
              <H3>Latest report</H3>
              <p>
                {latestReport.patient.name} ·{' '}
                {latestReport.releasedAt?.toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'long',
                })}{' '}
                · processed at {latestReport.lab.name}
              </p>
              <Badge
                tone={
                  latestReport.overallBand === 'GREEN'
                    ? 'green'
                    : latestReport.overallBand === 'YELLOW'
                      ? 'yellow'
                      : 'red'
                }
              >
                {latestReport.overallBand.toLowerCase()}
              </Badge>
              <Link href={`/caregiver/reports/${latestReport.id}`} className="font-semibold underline">
                Open it
              </Link>
            </Stack>
          </Card>
        )}

        <Stack gap="md">
          <H2>Your parents</H2>
          {family.patients.map((patient) => {
            const sub = patient.subscriptions[0];
            return (
              <Card key={patient.id}>
                <Stack gap="sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <H3>
                      {patient.name}, {patient.ageYears}
                    </H3>
                    {sub ? (
                      <Badge tone="green">{sub.plan.name}</Badge>
                    ) : (
                      <Badge tone="yellow">No plan yet</Badge>
                    )}
                  </div>

                  {patient.conditions && <Muted>{patient.conditions}</Muted>}

                  {sub ? (
                    <>
                      <p>
                        {formatINR(sub.effectivePricePaise)} a{' '}
                        {sub.billingCycle === 'ANNUAL' ? 'year' : 'month'}
                        {sub.isFoundingMember && ' · founding price, locked for life'}
                        {sub.assignedTechnician &&
                          ` · ${sub.assignedTechnician.user.name} visits`}
                      </p>
                      <Muted>
                        {sub.mandate?.status === 'ACTIVE'
                          ? `Paid automatically from ${sub.mandate.instrumentHint}`
                          : 'Payment method not yet set up'}
                      </Muted>
                    </>
                  ) : (
                    <ButtonLink href={`/caregiver/plan?patient=${patient.id}`}>
                      Choose a plan for {patient.name.split(' ')[0]}
                    </ButtonLink>
                  )}

                  <div className="flex flex-wrap gap-3 pt-2">
                    {patient.abhaAccount ? (
                      <Badge tone="primary">
                        Health account linked · {patient.abhaAccount.abhaAddress}
                      </Badge>
                    ) : (
                      <Link
                        href={`/caregiver/abha/${patient.id}`}
                        className="font-semibold underline"
                      >
                        Add an ABHA health account (optional)
                      </Link>
                    )}
                  </div>
                </Stack>
              </Card>
            );
          })}

          <ButtonLink href="/caregiver/onboarding" tone="secondary">
            Add another parent
          </ButtonLink>
        </Stack>
      </Stack>
    </Page>
  );
}
