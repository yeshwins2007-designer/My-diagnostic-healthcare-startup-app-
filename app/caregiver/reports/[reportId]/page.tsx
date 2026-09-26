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
import { RangeMeter, positionOf, type RangePosition } from '@/components/range-meter';
import {
  Badge,
  ButtonLink,
  Card,
  DataRow,
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
          className="inline-flex min-h-12 items-center gap-2 self-start font-semibold text-[var(--color-primary)]"
        >
          <span aria-hidden>←</span> All reports
        </Link>

        <Card elevated className="rise-in">
          <Stack gap="md">
            <Stack gap="sm">
              <span className="text-small font-semibold tracking-wide text-[var(--color-ink-soft)] uppercase">
                Laboratory report
              </span>
              <H1>{report.patient.name}</H1>
              <Lead>
                {report.releasedAt?.toLocaleDateString('en-IN', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </Lead>
            </Stack>
            <div className="flex flex-wrap items-center gap-4 border-t border-[var(--color-line)] pt-4">
              <Badge tone={BAND_TONE[band]} variant="tonal">
                <span aria-hidden>{band === 'GREEN' ? '✓' : band === 'RED' ? '!' : '↕'}</span>
                {band === 'GREEN'
                  ? 'All within range'
                  : band === 'RED'
                    ? 'Needs a doctor today'
                    : 'Some values outside range'}
              </Badge>
              <p className="text-[var(--color-ink-soft)]">
                <strong className="font-semibold text-[var(--color-ink)]">
                  {outside} of {results.length}
                </strong>{' '}
                outside the laboratory’s range
              </p>
            </div>
          </Stack>
        </Card>

        {openCritical.length > 0 && (
          <Card tone="red">
            <Stack gap="sm">
              <H3>The laboratory flagged this as urgent</H3>
              <p>
                {openCritical.map((c) => c.parameterName).join(', ')} needs medical attention.
                Please contact {firstName}’s doctor today.
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
          <Muted>Tap any result for the details your doctor may ask about.</Muted>

          <ul className="flex flex-col gap-4">
            {results.map(({ param, value, numeric, band: paramBand, position }, i) => {
              const hasRange = param.refLow !== null && param.refHigh !== null;
              const discipline =
                DISCIPLINE_LABELS[param.test.discipline as Discipline] ?? param.test.discipline;
              return (
                <Card
                  key={param.id}
                  as="li"
                  elevated
                  className={`rise-in ${param.isCritical ? 'border-[var(--color-red)]' : ''}`}
                  // Cards arrive in sequence rather than all at once; capped so a
                  // long panel never makes the last result wait.
                  style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                >
                  <div>
                    <Disclosure
                      summary={
                        <span className="flex flex-col gap-3">
                          <span className="flex flex-wrap items-start justify-between gap-3">
                            <span className="font-semibold">{param.test.name}</span>
                            <StatusChip
                              band={paramBand}
                              position={position}
                              critical={param.isCritical}
                            />
                          </span>
                          <span className="flex items-baseline gap-2">
                            {/* The result is the heaviest thing on the card. Sans
                                and proportional: tabular or mono figures make a
                                standalone number look broken. */}
                            <span className="text-h2 leading-none font-bold tracking-tight text-[var(--color-ink)]">
                              {value ?? '—'}
                            </span>
                            {param.unit && (
                              <span className="text-small font-normal text-[var(--color-ink-soft)]">
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
                            <span className="text-small font-normal text-[var(--color-ink-soft)]">
                              Laboratory range{' '}
                              <span className="font-semibold text-[var(--color-ink)]">
                                {param.refLow} – {param.refHigh}
                              </span>{' '}
                              {param.unit}
                            </span>
                          )}
                        </span>
                      }
                    >
                      <div className="rounded-[var(--radius-control)] bg-[var(--color-surface-sunken)] px-4">
                        {param.isCritical && (
                          <p className="border-b border-[var(--color-line)] py-3 font-semibold text-[var(--color-red)]">
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
                          <DataRow
                            label="Standard code, for your doctor"
                            value={<span className="font-mono">{param.test.loincCode}</span>}
                          />
                        )}
                      </div>
                    </Disclosure>
                  </div>
                </Card>
              );
            })}
          </ul>

          <Card tone="info">
            <Stack gap="sm">
              <H3>Reading this</H3>
              <p>
                The bands come from comparing each value against the laboratory’s own reference
                range — nothing more. A value outside its range is not a diagnosis, and a value
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
