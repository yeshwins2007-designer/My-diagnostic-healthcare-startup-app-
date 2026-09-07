import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import { auditTrailFor } from '@/lib/compliance/audit';
import { readClock, budgetForSpecimens } from '@/lib/sop/sampleClock';
import { classifyArrival } from '@/lib/sop/visitWindow';
import { findLoggingGaps } from '@/lib/sop/coldChain';
import { CHECKLIST_STEPS } from '@/lib/enums';
import { ReleaseReportButton } from '@/components/release-report-button';
import {
  Badge,
  Card,
  DataRow,
  H1,
  H2,
  H3,
  Lead,
  Muted,
  Page,
  Stack,
} from '@/components/ui';

export const metadata: Metadata = { title: 'Visit' };
export const dynamic = 'force-dynamic';

/**
 * The whole life of one visit, on one screen.
 *
 * This is where a coordinator answers "what actually happened?" — the SOP
 * steps, the chain of custody with its temperatures, the clock, and the
 * immutable audit trail. It is also where a signed report is released, which
 * is the permanent human-verification gate: nothing reaches a family until a
 * person has checked the identifiers match.
 */
export default async function OpsBookingPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  await requireRole('OPS');

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      patient: { include: { family: { include: { members: { include: { user: true } } } } } },
      address: true,
      technician: { include: { user: true } },
      lab: true,
      zone: true,
      subscription: { include: { plan: true, assignedTechnician: { include: { user: true } } } },
      items: { include: { panel: { include: { items: { include: { test: true } } } } } },
      checklistSteps: { orderBy: { sequence: 'asc' } },
      consents: true,
      specimens: {
        include: {
          coldChainLogs: { orderBy: { recordedAt: 'asc' } },
          handoff: { include: { lab: true, technician: { include: { user: true } } } },
        },
      },
      reports: { include: { parameters: true, criticals: true } },
      incidents: true,
    },
  });

  if (!booking) notFound();

  const trail = await auditTrailFor('Booking', booking.id);
  const caregiver = booking.patient.family.members[0]?.user;
  const arrival = classifyArrival(booking);
  const specimen = booking.specimens[0];

  const stabilities = booking.items
    .flatMap((i) => i.panel?.items.map((pi) => pi.test.stabilityHours) ?? [])
    .filter(Boolean);

  const clock = specimen
    ? readClock({
        clockStartsAt: specimen.clockStartsAt,
        intakeAt: specimen.intakeAt,
        budgetMinutes: budgetForSpecimens(stabilities),
      })
    : null;

  const gaps = specimen
    ? findLoggingGaps(
        specimen.coldChainLogs.map((l) => ({
          temperatureC: l.temperatureC,
          recordedAt: l.recordedAt,
          boxSealed: l.boxSealed,
        })),
      )
    : [];

  const pendingRelease = booking.reports.filter((r) => r.status !== 'RELEASED');

  return (
    <Page wide>
      <Stack gap="lg">
        <Stack gap="sm">
          <Link href="/ops/today" className="font-semibold underline">
            ← Today
          </Link>
          <H1>
            {booking.patient.name}, {booking.patient.ageYears}
          </H1>
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{booking.reference}</Badge>
            <Badge tone={arrival === 'LATE' ? 'red' : 'green'}>
              {arrival === 'PENDING'
                ? booking.status.replace(/_/g, ' ').toLowerCase()
                : arrival === 'LATE'
                  ? 'arrived after the window'
                  : 'arrived within the window'}
            </Badge>
            {booking.intakeChannel !== 'APP' && (
              <Badge>booked via {booking.intakeChannel.toLowerCase()}</Badge>
            )}
            {booking.radiusOverride && <Badge tone="yellow">radius override</Badge>}
            {booking.isFreeRecollection && <Badge tone="info">free recollection</Badge>}
          </div>
          <Lead>
            {booking.windowStart.toLocaleString('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              hour: 'numeric',
              minute: '2-digit',
            })}{' '}
            –{' '}
            {booking.windowEnd.toLocaleTimeString('en-IN', {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </Lead>
        </Stack>

        {booking.delayNotifiedAt && (
          <Card tone="yellow">
            <Muted>
              The family was warned about a delay at{' '}
              {booking.delayNotifiedAt.toLocaleTimeString('en-IN')} — before the window closed,
              which is the rule.
            </Muted>
          </Card>
        )}

        {booking.radiusOverride && booking.radiusOverrideReason && (
          <Card tone="yellow">
            <Stack gap="sm">
              <H3>Out-of-zone override</H3>
              <p>{booking.radiusOverrideReason}</p>
              <Muted>This visit counts against morning route density.</Muted>
            </Stack>
          </Card>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <Stack gap="sm">
              <H3>Who and where</H3>
              <DataRow label="Family contact" value={`${caregiver?.name} · ${caregiver?.phone}`} />
              <DataRow
                label="Address"
                value={`${booking.address.line1}${booking.address.landmark ? ` (${booking.address.landmark})` : ''}`}
              />
              <DataRow label="Zone" value={booking.zone?.name ?? 'none'} />
              <DataRow
                label="Technician"
                value={booking.technician?.user.name ?? 'unassigned'}
              />
              {booking.subscription?.assignedTechnician && (
                <DataRow
                  label="Promised technician"
                  value={booking.subscription.assignedTechnician.user.name}
                  tone={
                    booking.subscription.assignedTechnicianId === booking.technicianId
                      ? 'green'
                      : 'yellow'
                  }
                />
              )}
              <DataRow label="Laboratory" value={booking.lab?.name ?? 'not routed'} />
              <DataRow
                label="Plan"
                value={booking.subscription?.plan.name ?? 'one-off booking'}
              />
            </Stack>
          </Card>

          <Card>
            <Stack gap="sm">
              <H3>Consent</H3>
              {booking.consents.length === 0 ? (
                <Muted>No consent recorded yet.</Muted>
              ) : (
                booking.consents.map((consent) => (
                  <DataRow
                    key={consent.id}
                    label={`${consent.purpose.replace(/_/g, ' ').toLowerCase()} · ${consent.method.replace(/_/g, ' ').toLowerCase()}`}
                    value={
                      consent.granted
                        ? `granted ${consent.grantedAt.toLocaleTimeString('en-IN')}${consent.proxyName ? ` by ${consent.proxyName} (${consent.proxyRelation})` : ''}`
                        : 'declined'
                    }
                    tone={consent.granted ? 'green' : 'red'}
                  />
                ))
              )}
              {booking.patient.needsProxyConsent && (
                <Muted>
                  This patient cannot give informed consent themselves; family authorisation is
                  required at every visit.
                </Muted>
              )}
            </Stack>
          </Card>
        </div>

        {specimen && clock && (
          <Card
            tone={clock.state === 'BREACHED' ? 'red' : clock.state === 'AMBER' ? 'yellow' : 'green'}
          >
            <Stack gap="sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <H2 className="text-[var(--text-h3)]">Chain of custody</H2>
                <Badge
                  tone={
                    clock.state === 'BREACHED'
                      ? 'red'
                      : clock.state === 'AMBER'
                        ? 'yellow'
                        : 'green'
                  }
                >
                  {clock.label}
                </Badge>
              </div>

              <DataRow label="Barcode" value={specimen.barcode} />
              <DataRow label="Identifier 1" value={specimen.identifier1} />
              <DataRow label="Identifier 2" value={specimen.identifier2} />
              <DataRow
                label="Labelled at the bedside"
                value={specimen.labelledAtBedside ? 'yes' : 'NO'}
                tone={specimen.labelledAtBedside ? 'green' : 'red'}
              />
              <DataRow
                label="Collected"
                value={specimen.collectedAt?.toLocaleTimeString('en-IN') ?? '—'}
              />
              <DataRow
                label="Lab intake"
                value={specimen.intakeAt?.toLocaleTimeString('en-IN') ?? 'not yet'}
              />
              {specimen.handoff && (
                <DataRow
                  label="Received by"
                  value={`${specimen.handoff.receivedByName} at ${specimen.handoff.lab.name} · ${specimen.handoff.elapsedMinutes} min`}
                  tone={specimen.handoff.isBreach ? 'red' : 'green'}
                />
              )}
              {specimen.status === 'REJECTED' && (
                <DataRow
                  label="Rejected"
                  value={specimen.rejectionReason}
                  tone="red"
                />
              )}

              <H3 className="mt-3 text-[var(--text-lead)]">Cold box</H3>
              {specimen.coldChainLogs.length === 0 ? (
                <Muted>No temperature was ever logged.</Muted>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {specimen.coldChainLogs.map((log) => (
                    <Badge key={log.id} tone={log.isBreach ? 'red' : 'green'}>
                      {log.temperatureC.toFixed(1)} °C at{' '}
                      {log.recordedAt.toLocaleTimeString('en-IN', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </Badge>
                  ))}
                </div>
              )}
              {gaps.length > 0 && (
                <Muted>
                  {gaps.length} logging gap{gaps.length === 1 ? '' : 's'} — longest{' '}
                  {Math.max(...gaps.map((g) => g.gapMinutes))} minutes.
                </Muted>
              )}
            </Stack>
          </Card>
        )}

        <Card>
          <Stack gap="sm">
            <H2 className="text-[var(--text-h3)]">The eleven steps</H2>
            <ol className="flex flex-col gap-2">
              {CHECKLIST_STEPS.map((step) => {
                const row = booking.checklistSteps.find((s) => s.stepKey === step.key);
                return (
                  <li key={step.key} className="flex gap-3">
                    <span
                      aria-hidden
                      className={
                        row?.completedAt
                          ? 'text-[var(--color-green)]'
                          : 'text-[var(--color-ink-faint)]'
                      }
                    >
                      {row?.completedAt ? '✓' : '○'}
                    </span>
                    <span className={row?.completedAt ? 'text-[var(--color-ink-faint)]' : ''}>
                      {step.sequence}. {step.label}
                      {row?.completedAt && (
                        <span className="ml-2 text-[var(--text-tiny)]">
                          {row.completedAt.toLocaleTimeString('en-IN', {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          </Stack>
        </Card>

        {pendingRelease.length > 0 && (
          <Card tone="yellow">
            <Stack gap="md">
              <H2 className="text-[var(--text-h3)]">Awaiting human verification</H2>
              <p>
                The pathologist has signed. Before this reaches the family, check that the
                identifiers on the report match the physical sample: two identifiers on the vial,
                the patient’s name, and the booking reference.
              </p>
              {pendingRelease.map((report) => (
                <Card key={report.id} tone="surface">
                  <Stack gap="sm">
                    <DataRow label="Signed by" value={report.pathologistName ?? '—'} />
                    <DataRow label="Parameters" value={String(report.parameters.length)} />
                    <DataRow
                      label="Worst band"
                      value={report.overallBand.toLowerCase()}
                      tone={
                        report.overallBand === 'RED'
                          ? 'red'
                          : report.overallBand === 'YELLOW'
                            ? 'yellow'
                            : 'green'
                      }
                    />
                    <Muted>
                      Releasing creates the 24-hour family call automatically, and raises a
                      critical-value alert for anything the laboratory flagged.
                    </Muted>
                    <ReleaseReportButton reportId={report.id} />
                  </Stack>
                </Card>
              ))}
            </Stack>
          </Card>
        )}

        {booking.incidents.length > 0 && (
          <Card tone="red">
            <Stack gap="sm">
              <H3>Incidents</H3>
              {booking.incidents.map((incident) => (
                <DataRow
                  key={incident.id}
                  label={`${incident.tier.replace(/_/g, ' ').toLowerCase()} · ${incident.kind.replace(/_/g, ' ').toLowerCase()}`}
                  value={incident.summary}
                />
              ))}
            </Stack>
          </Card>
        )}

        <Card tone="sunken">
          <Stack gap="sm">
            <H2 className="text-[var(--text-h3)]">Audit trail</H2>
            <Muted>
              Every entry below is hash-chained to the one before it. {trail.length} recorded for
              this visit.
            </Muted>
            {trail.length === 0 ? (
              <Muted>Nothing logged against this booking yet.</Muted>
            ) : (
              <ul className="flex flex-col gap-2">
                {trail.map((entry) => (
                  <li
                    key={entry.sequence}
                    className="flex flex-wrap justify-between gap-3 border-b border-[var(--color-line)] pb-2 text-[var(--text-small)] last:border-b-0"
                  >
                    <span className="font-medium">
                      {entry.action.replace(/_/g, ' ').toLowerCase()}
                    </span>
                    <span className="text-[var(--color-ink-faint)]">
                      {entry.actorRole.toLowerCase()} ·{' '}
                      {entry.occurredAt.toLocaleString('en-IN')} · #{entry.sequence}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Stack>
        </Card>
      </Stack>
    </Page>
  );
}
