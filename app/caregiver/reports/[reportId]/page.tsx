import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import { audit } from '@/lib/compliance/audit';
import { tryDecryptField } from '@/lib/compliance/crypto';
import { brand } from '@/lib/brand';
import {
  Badge,
  Card,
  Disclaimer,
  H1,
  H2,
  H3,
  Lead,
  Muted,
  Page,
  Stack,
} from '@/components/ui';

export const metadata: Metadata = { title: 'Report' };
export const dynamic = 'force-dynamic';

const BAND_TONE = { GREEN: 'green', YELLOW: 'yellow', RED: 'red' } as const;

/**
 * The full report, for the family.
 *
 * This is the one surface that shows actual values, because the family is
 * entitled to their own record and will take it to a doctor. What it does NOT
 * do is interpret them: each row shows the value, its unit and the laboratory's
 * reference range, and the page says plainly that the person to go through it
 * with is the treating physician.
 *
 * The printed card the patient receives deliberately carries no numbers at all.
 */
export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const user = await requireRole('CAREGIVER');

  // Scoped by family membership: this is the access-control boundary for every
  // health record in the product.
  const report = await db.report.findFirst({
    where: {
      id: reportId,
      status: 'RELEASED',
      booking: { family: { members: { some: { userId: user.id } } } },
    },
    include: {
      patient: true,
      lab: { include: { accreditation: true } },
      booking: { include: { technician: { include: { user: true } } } },
      parameters: { include: { test: true }, orderBy: { band: 'desc' } },
      criticals: true,
      followUps: { include: { placedBy: true } },
    },
  });

  if (!report) notFound();

  await audit({
    action: 'REPORT_ACCESSED',
    entityType: 'Report',
    entityId: report.id,
    actorUserId: user.id,
    actorRole: 'CAREGIVER',
    detail: { surface: 'caregiver_full_report' },
  });

  const band = report.overallBand as keyof typeof BAND_TONE;
  const openCritical = report.criticals.filter((c) => c.status !== 'CLOSED');
  const call = report.followUps[0];

  return (
    <Page>
      <Stack gap="lg">
        <Stack gap="sm">
          <Link href="/caregiver/reports" className="font-semibold underline">
            ← All reports
          </Link>
          <H1>{report.patient.name}</H1>
          <Lead>
            {report.releasedAt?.toLocaleDateString('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </Lead>
          <Badge tone={BAND_TONE[band]}>{band.toLowerCase()}</Badge>
        </Stack>

        {openCritical.length > 0 && (
          <Card tone="red">
            <Stack gap="sm">
              <H3>The laboratory flagged this as urgent</H3>
              <p>
                {openCritical.map((c) => c.parameterName).join(', ')} needs medical attention.
                Please contact {report.patient.name.split(' ')[0]}’s doctor today.
              </p>
              <p>
                If they are unwell right now — chest pain, breathlessness, confusion, or you
                cannot wake them — call {brand.emergencyNumber} or go to the nearest hospital.
              </p>
              <Muted>
                We cannot tell you what the value means. Only a doctor can, and we would be
                wrong to guess.
              </Muted>
            </Stack>
          </Card>
        )}

        <Stack gap="md">
          <H2>Results</H2>
          <Card>
            <div className="scroll-x">
              <table className="w-full min-w-[36rem] border-collapse">
                <thead>
                  <tr className="border-b-2 border-[var(--color-line-strong)] text-left">
                    <th className="py-3 pr-4">Test</th>
                    <th className="py-3 pr-4">Result</th>
                    <th className="py-3 pr-4">Normal range</th>
                    <th className="py-3">Band</th>
                  </tr>
                </thead>
                <tbody>
                  {report.parameters.map((param) => {
                    // Values are encrypted at rest; one unreadable row must not
                    // blank out the whole report.
                    const value = tryDecryptField(param.valueEncrypted);
                    const paramBand = param.band as keyof typeof BAND_TONE;
                    return (
                      <tr key={param.id} className="border-b border-[var(--color-line)]">
                        <td className="py-4 pr-4 font-medium">{param.test.name}</td>
                        <td className="py-4 pr-4 font-mono text-[var(--text-lead)] font-semibold">
                          {value ?? '—'} {param.unit}
                        </td>
                        <td className="py-4 pr-4 font-mono text-[var(--color-ink-faint)]">
                          {param.refLow !== null && param.refHigh !== null
                            ? `${param.refLow} – ${param.refHigh} ${param.unit}`
                            : '—'}
                        </td>
                        <td className="py-4">
                          <Badge tone={BAND_TONE[paramBand]}>
                            {param.isCritical ? 'urgent' : paramBand.toLowerCase()}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card tone="info">
            <Stack gap="sm">
              <H3>Reading this</H3>
              <p>
                The bands come from comparing each value against the laboratory’s own reference
                range — nothing more. A value outside its range is not a diagnosis, and a value
                inside one is not a clean bill of health.
              </p>
              <Muted>
                Take this to {report.patient.name.split(' ')[0]}’s doctor. They have the history
                and the examination; we have a number and a range.
              </Muted>
            </Stack>
          </Card>
        </Stack>

        <Card>
          <Stack gap="sm">
            <H3>Where this came from</H3>
            <Muted>
              Sample collected on{' '}
              {report.booking.windowStart.toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
              })}
              {report.booking.technician && ` by ${report.booking.technician.user.name}`}.
              Processed at {report.lab.name}
              {report.lab.brandingConsent && report.lab.accreditation
                ? `, NABL-accredited ${report.lab.accreditation.certificateNumber}`
                : ''}
              {report.pathologistName &&
                `, signed by ${report.pathologistName}${report.pathologistReg ? ` (${report.pathologistReg})` : ''}`}
              . Reference {report.booking.reference}.
            </Muted>
          </Stack>
        </Card>

        {call && (
          <Card tone={call.status === 'COMPLETED' ? 'green' : 'yellow'}>
            <Stack gap="sm">
              <H3>Our call to you</H3>
              {call.status === 'COMPLETED' ? (
                <>
                  <Muted>
                    {call.placedBy?.name ?? 'A coordinator'} called on{' '}
                    {call.completedAt?.toLocaleString('en-IN')}.
                  </Muted>
                  {call.whatWorriedYou && (
                    <p>
                      <strong>What worried you:</strong> {call.whatWorriedYou}
                    </p>
                  )}
                  {call.whatWouldImprove && (
                    <p>
                      <strong>What would make you do this every month:</strong>{' '}
                      {call.whatWouldImprove}
                    </p>
                  )}
                </>
              ) : (
                <p>
                  We owe you a call about this report by{' '}
                  {call.dueBy.toLocaleString('en-IN')}. We call every family within 24 hours of
                  every report.
                </p>
              )}
            </Stack>
          </Card>
        )}

        <Link
          href={`/report/${report.id}/card`}
          className="inline-flex min-h-[var(--size-touch)] items-center justify-center rounded-[var(--radius-control)] border-2 border-[var(--color-line-strong)] px-6 font-semibold"
        >
          Printable card for {report.patient.name.split(' ')[0]}
        </Link>

        <Disclaimer text={brand.disclaimer} />
      </Stack>
    </Page>
  );
}
