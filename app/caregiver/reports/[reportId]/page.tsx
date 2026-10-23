import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import { audit } from '@/lib/compliance/audit';
import { tryDecryptField } from '@/lib/compliance/crypto';
import { brand } from '@/lib/brand';
import { DISCIPLINE_LABELS, type Discipline } from '@/lib/enums';
import { Disclosure } from '@/components/disclosure';
import { OverallBandChip } from '@/components/band-chip';
import { RangeMeter, positionOf, type RangePosition } from '@/components/range-meter';
import { Morph } from '@/components/morph';
import {
  Badge,
  ButtonLink,
  Card,
  DataRow,
  Disclaimer,
  Eyebrow,
  H1,
  H2,
  H3,
  Metric,
  Muted,
  Page,
  Stack,
} from '@/components/ui';

export const metadata: Metadata = { title: 'Report' };
export const dynamic = 'force-dynamic';

const BAND_TONE = { GREEN: 'green', YELLOW: 'yellow', RED: 'red' } as const;

/**
 * Most urgent first. The query used to order by `band desc`, but band is a
 * string, so that sorted YELLOW > RED > GREEN and put an urgent result below
 * a borderline one.
 */
const BAND_ORDER = { RED: 0, YELLOW: 1, GREEN: 2 } as const;

/** Status always carries a glyph and words, never colour alone. */
function StatusChip({
  band,
  position,
  critical,
}: {
  band: keyof typeof BAND_TONE;
  position: RangePosition | null;
  critical: boolean;
}) {
  if (critical) {
    return (
      <Badge tone="red">
        <span aria-hidden>!</span> Urgent
      </Badge>
    );
  }
  if (band === 'GREEN' || position === 'within') {
    return (
      <Badge tone="green" variant="tonal">
        <span aria-hidden>✓</span> Within range
      </Badge>
    );
  }
  return (
    <Badge tone="yellow" variant="tonal">
      <span aria-hidden>{position === 'below' ? '↓' : '↑'}</span>{' '}
      {position === 'below' ? 'Below range' : 'Above range'}
    </Badge>
  );
}

function humanise(code: string): string {
  return code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, ' ');
}

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
      parameters: { include: { test: true } },
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

  const results = report.parameters
    .map((param) => {
      // Values are encrypted at rest; one unreadable row must not blank out
      // the whole report.
      const value = tryDecryptField(param.valueEncrypted);
      const numeric = value !== null ? Number.parseFloat(value) : Number.NaN;
      const hasRange = param.refLow !== null && param.refHigh !== null;
      return {
        param,
        value,
        numeric,
        band: param.band as keyof typeof BAND_TONE,
        position:
          hasRange && Number.isFinite(numeric)
            ? positionOf(numeric, param.refLow as number, param.refHigh as number)
            : null,
      };
    })
    .sort((a, b) => BAND_ORDER[a.band] - BAND_ORDER[b.band]);

  const outside = results.filter((r) => r.band !== 'GREEN').length;
  const firstName = report.patient.name.split(' ')[0];

  return (
    <Page>
      <Stack gap="lg">
        <Link
          href="/caregiver/reports"
          className="inline-flex min-h-12 items-center gap-2 self-start text-small font-medium text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
        >
          <span aria-hidden>←</span> All reports
        </Link>

        {/* The same card the summary was: it morphs into this header. */}
        <Morph name={`report-${report.id}`}>
          <section className="panel flex flex-col gap-5 rounded-[var(--radius-card-lg)] border p-5 [box-shadow:var(--shadow-card)] sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <Eyebrow>Laboratory report</Eyebrow>
              <span className="reading text-small text-[var(--color-ink-faint)]">
                {report.booking.reference}
              </span>
            </div>
            <Stack gap="sm">
              <H1>{report.patient.name}</H1>
              <p className="reading text-small text-[var(--color-ink-soft)]">
                {report.releasedAt?.toLocaleDateString('en-IN', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </Stack>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-3">
              <Metric
                className="bg-[var(--color-surface)] p-3.5"
                label="Outside range"
                value={`${outside}/${results.length}`}
                tone={outside === 0 ? 'green' : band === 'RED' ? 'red' : 'yellow'}
              />
              <Metric
                className="bg-[var(--color-surface)] p-3.5"
                label="Laboratory"
                value={<span className="text-base">{report.lab.name}</span>}
              />
              <Metric
                className="col-span-2 bg-[var(--color-surface)] p-3.5 sm:col-span-1"
                label="Collected"
                value={report.booking.windowStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <OverallBandChip band={band} />
              <p className="text-small text-[var(--color-ink-soft)]">
                <strong className="font-medium text-[var(--color-ink)]">
                  {outside} of {results.length}
                </strong>{' '}
                outside the laboratory’s range
              </p>
            </div>
          </section>
        </Morph>

        {openCritical.length > 0 && (
          <Card tone="red">
            <Stack gap="sm">
              <H3>The laboratory flagged this as urgent</H3>
              <p>
                {new Intl.ListFormat('en-IN', { type: 'conjunction' }).format(
                  openCritical.map((c) => c.parameterName),
                )}{' '}
                {openCritical.length === 1 ? 'needs' : 'need'} medical attention.
                Please contact {firstName}’s doctor today.
              </p>
              <p>
                If they feel unwell right now (chest pain, trouble breathing, confusion, or you can’t wake them), call {brand.emergencyNumber} or go to the nearest hospital.
              </p>
              <Muted>
                We cannot tell you what the value means. Only a doctor can, and we would be
                wrong to guess.
              </Muted>
            </Stack>
          </Card>
        )}

        <Stack gap="md">
          <div className="flex items-end justify-between gap-3">
            <H2>Results</H2>
            <Eyebrow>{results.length} parameters</Eyebrow>
          </div>
          <Muted>Tap any result for the details your doctor may ask about.</Muted>

          <ul className="stagger panel flex flex-col overflow-hidden rounded-[var(--radius-card-lg)] border">
            {results.map(({ param, value, numeric, band: paramBand, position }) => {
              const hasRange = param.refLow !== null && param.refHigh !== null;
              const discipline =
                DISCIPLINE_LABELS[param.test.discipline as Discipline] ?? param.test.discipline;
              return (
                <li
                  key={param.id}
                  className={`border-b border-[var(--color-line)] px-5 py-4 last:border-b-0 ${
                    param.isCritical ? 'bg-[var(--color-red-wash)] [box-shadow:inset_2px_0_0_var(--color-red)]' : ''
                  }`}
                >
                  <Disclosure
                    summary={
                      <span className="flex flex-col gap-2.5">
                        <span className="flex flex-wrap items-start justify-between gap-3">
                          <span className="font-medium">{param.test.name}</span>
                          <StatusChip
                            band={paramBand}
                            position={position}
                            critical={param.isCritical}
                          />
                        </span>
                        <span className="flex items-baseline gap-2">
                          {/* The reading: the heaviest thing in the row. */}
                          <span className="reading text-[1.75rem] leading-none font-medium tracking-tight">
                            {value ?? '—'}
                          </span>
                          {param.unit && (
                            <span className="font-mono text-small text-[var(--color-ink-faint)]">
                              {param.unit}
                            </span>
                          )}
                        </span>
                        {hasRange && Number.isFinite(numeric) && (
                          <RangeMeter
                            value={numeric}
                            low={param.refLow as number}
                            high={param.refHigh as number}
                            band={paramBand}
                          />
                        )}
                        {hasRange && (
                          <span className="flex items-center justify-between gap-3 text-small text-[var(--color-ink-faint)]">
                            <span>Laboratory range</span>
                            <span className="font-mono text-[var(--color-ink-soft)]">
                              {param.refLow} – {param.refHigh} {param.unit}
                            </span>
                          </span>
                        )}
                      </span>
                    }
                  >
                    <div className="rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface-sunken)] px-4">
                      {param.isCritical && (
                        <p className="border-b border-[var(--color-line)] py-3 font-medium text-[var(--color-red)]">
                          The laboratory flagged this value. Please speak to {firstName}’s
                          doctor today.
                        </p>
                      )}
                      <DataRow label="Area of testing" value={discipline} />
                      <DataRow label="Sample" value={humanise(param.test.sampleType)} />
                      <DataRow
                        label="Fasting"
                        value={
                          param.test.fastingHours > 0
                            ? `${param.test.fastingHours} hours`
                            : 'Not required'
                        }
                      />
                      {param.test.loincCode && (
                        <DataRow label="Standard code, for your doctor" value={param.test.loincCode} />
                      )}
                    </div>
                  </Disclosure>
                </li>
              );
            })}
          </ul>

          <Card tone="info">
            <Stack gap="sm">
              <H3>Reading this</H3>
              <p>
                The bands come from comparing each value against the laboratory’s own reference
                range, and nothing else. A value outside its range is not a diagnosis, and a value
                inside one is not a clean bill of health.
              </p>
              <Muted>
                Take this to {firstName}’s doctor. They have the history
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

        <ButtonLink href={`/report/${report.id}/card`} tone="secondary" full>
          Printable card for {firstName}
        </ButtonLink>

        <Disclaimer text={brand.disclaimer} />
      </Stack>
    </Page>
  );
}
