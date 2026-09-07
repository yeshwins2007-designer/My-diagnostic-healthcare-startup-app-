import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { DISCIPLINE_LABELS, type Discipline } from '@/lib/enums';
import { parseScope } from '@/lib/sop/labRouting';
import { readClock } from '@/lib/sop/sampleClock';
import { LabIntakePanel } from '@/components/lab-intake-panel';
import {
  Badge,
  Card,
  DataRow,
  EmptyState,
  H1,
  H2,
  H3,
  Lead,
  Muted,
  Page,
  Stack,
} from '@/components/ui';

export const metadata: Metadata = { title: 'Laboratory' };
export const dynamic = 'force-dynamic';

const STATUS_COPY: Record<string, { tone: 'green' | 'yellow' | 'red' | 'info'; text: string }> = {
  SUBMITTED: {
    tone: 'info',
    text: 'Your application is with our team. A person checks every certificate against the NABL public directory before any sample is routed to you — usually within two working days.',
  },
  UNDER_REVIEW: {
    tone: 'info',
    text: 'We are working through the verification checklist now.',
  },
  VERIFIED: {
    tone: 'yellow',
    text: 'Verified. We will activate you once the service agreement is signed.',
  },
  ACTIVE: { tone: 'green', text: 'Active. Samples are being routed to you.' },
  SUSPENDED: {
    tone: 'red',
    text: 'Suspended. No samples are being routed until this is resolved.',
  },
  REJECTED: { tone: 'red', text: 'This application was not accepted.' },
};

export default async function LabHome({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { submitted } = await searchParams;
  const user = await requireRole('LAB');

  const membership = await db.labMember.findFirst({
    where: { userId: user.id },
    include: {
      lab: {
        include: {
          accreditation: { include: { checks: true } },
          agreements: { orderBy: { version: 'desc' }, take: 1 },
        },
      },
    },
  });

  if (!membership) redirect('/lab/apply');
  const lab = membership.lab;
  const status = STATUS_COPY[lab.status] ?? STATUS_COPY.SUBMITTED;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [incoming, awaitingResults, todayVolume] = await Promise.all([
    db.specimen.findMany({
      where: { status: { in: ['COLLECTED', 'IN_TRANSIT', 'RECEIVED'] }, booking: { labId: lab.id } },
      include: {
        booking: { include: { patient: true, technician: { include: { user: true } } } },
        coldChainLogs: { orderBy: { recordedAt: 'desc' }, take: 1 },
      },
      orderBy: { collectedAt: 'asc' },
    }),
    db.booking.findMany({
      where: { labId: lab.id, status: 'PROCESSING' },
      include: {
        patient: true,
        items: { include: { panel: { include: { items: { include: { test: true } } } } } },
      },
    }),
    db.booking.count({ where: { labId: lab.id, windowStart: { gte: startOfDay } } }),
  ]);

  const scope = lab.accreditation ? parseScope(lab.accreditation.scope) : [];
  const daysToExpiry = lab.accreditation
    ? Math.ceil((lab.accreditation.validUntil.getTime() - Date.now()) / 86_400_000)
    : 0;

  return (
    <Page wide>
      <Stack gap="lg">
        <Stack gap="sm">
          <H1>{lab.name}</H1>
          <Lead>{status.text}</Lead>
          <div className="flex flex-wrap gap-2">
            <Badge tone={status.tone}>{lab.status.replace(/_/g, ' ').toLowerCase()}</Badge>
            {lab.accreditation && (
              <Badge tone={daysToExpiry <= 60 ? 'yellow' : 'neutral'}>
                {lab.accreditation.certificateNumber} · {daysToExpiry} days to renewal
              </Badge>
            )}
          </div>
        </Stack>

        {submitted && (
          <Card tone="info">
            <Stack gap="sm">
              <H3>Application received</H3>
              <p>
                Thank you. Registering is an application, not an activation — that is deliberate.
                A person verifies your certificate, your scope and your address against the NABL
                directory before we send you a single human sample.
              </p>
            </Stack>
          </Card>
        )}

        {lab.statusReason && (
          <Card tone="red">
            <p>{lab.statusReason}</p>
          </Card>
        )}

        {lab.accreditation && (
          <Card>
            <Stack gap="sm">
              <H3>Your accredited scope</H3>
              <div className="flex flex-wrap gap-2">
                {scope.map((d) => (
                  <Badge key={d} tone="primary">
                    {DISCIPLINE_LABELS[d as Discipline] ?? d}
                  </Badge>
                ))}
              </div>
              <Muted>
                We only route tests whose discipline appears here. If your certificate covers
                more than this list, tell us — an incomplete scope means less work routed to
                you, not more.
              </Muted>
              <DataRow
                label="Daily capacity ceiling"
                value={`${todayVolume} of ${lab.capacityCeiling} today`}
                tone={todayVolume >= lab.capacityCeiling ? 'red' : 'green'}
              />
              <DataRow
                label="Supervising pathologist"
                value={`${lab.accreditation.supervisingPathologistName} · ${lab.accreditation.supervisingPathologistReg}`}
              />
              <DataRow
                label="ABDM publishing"
                value={
                  lab.abdmMode === 'PLATFORM_FACILITATED'
                    ? 'We publish signed reports to the patient’s ABHA on your behalf'
                    : lab.abdmMode === 'LAB_SELF'
                      ? 'You publish to ABDM yourself — we do not, to avoid duplicates'
                      : 'Not publishing to ABDM'
                }
              />
              {lab.agreements[0] && (
                <DataRow
                  label="Service agreement"
                  value={
                    <Link href="/lab/agreement" className="underline">
                      version {lab.agreements[0].version} ·{' '}
                      {lab.agreements[0].status.toLowerCase()}
                    </Link>
                  }
                />
              )}
            </Stack>
          </Card>
        )}

        {lab.status === 'ACTIVE' && (
          <>
            <Stack gap="md">
              <H2>Incoming samples</H2>
              {incoming.length === 0 ? (
                <EmptyState
                  title="Nothing in transit"
                  body="Samples appear here the moment a technician collects them, with their cold-box temperature and the time remaining."
                />
              ) : (
                incoming.map((specimen) => {
                  const clock = readClock({
                    clockStartsAt: specimen.clockStartsAt,
                    intakeAt: specimen.intakeAt,
                  });
                  const tone =
                    clock.state === 'BREACHED'
                      ? 'red'
                      : clock.state === 'AMBER'
                        ? 'yellow'
                        : 'green';
                  return (
                    <Card key={specimen.id} tone={tone}>
                      <Stack gap="sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <H3>{specimen.barcode}</H3>
                          <Badge tone={tone}>{clock.label}</Badge>
                        </div>
                        <DataRow label="Patient" value={specimen.identifier1} />
                        <DataRow label="Second identifier" value={specimen.identifier2} />
                        <DataRow label="Tube" value={specimen.tubeType} />
                        <DataRow
                          label="Cold box"
                          value={
                            specimen.coldChainLogs[0]
                              ? `${specimen.coldChainLogs[0].temperatureC.toFixed(1)} °C`
                              : 'not logged'
                          }
                          tone={specimen.coldChainLogs[0]?.isBreach ? 'red' : 'green'}
                        />
                        <Muted>
                          Collected by {specimen.booking.technician?.user.name ?? 'unknown'}
                        </Muted>
                      </Stack>
                    </Card>
                  );
                })
              )}
            </Stack>

            <LabIntakePanel
              pendingReports={awaitingResults.map((booking) => ({
                bookingId: booking.id,
                reference: booking.reference,
                patientName: booking.patient.name,
                testCodes: [
                  ...new Set(
                    booking.items.flatMap(
                      (i) => i.panel?.items.map((pi) => pi.test.code) ?? [],
                    ),
                  ),
                ],
              }))}
              defaultPathologistName={lab.accreditation?.supervisingPathologistName ?? ''}
              defaultPathologistReg={lab.accreditation?.supervisingPathologistReg ?? ''}
            />
          </>
        )}
      </Stack>
    </Page>
  );
}
