import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { CHECKLIST_STEPS } from '@/lib/enums';
import { readClock } from '@/lib/sop/sampleClock';
import { COLD_CHAIN_MAX_C, COLD_CHAIN_MIN_C } from '@/lib/sop/coldChain';
import { t } from '@/lib/i18n/dictionary';
import { isLocale, type Locale } from '@/lib/i18n/locales';
import { VisitWorkflow } from '@/components/visit-workflow';
import {
  Badge,
  Card,
  DataRow,
  H1,
  H3,
  Muted,
  Page,
  Stack,
} from '@/components/ui';

export const metadata: Metadata = { title: 'Visit' };
export const dynamic = 'force-dynamic';

export default async function VisitPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const user = await requireRole('TECHNICIAN');

  const technician = await db.technician.findUnique({ where: { userId: user.id } });
  if (!technician) notFound();

  const booking = await db.booking.findFirst({
    where: { id: bookingId, technicianId: technician.id },
    include: {
      patient: {
        include: { family: { include: { members: { include: { user: true } } } } },
      },
      address: true,
      lab: true,
      items: { include: { panel: { include: { items: { include: { test: true } } } } } },
      checklistSteps: { orderBy: { sequence: 'asc' } },
      specimens: { include: { coldChainLogs: { orderBy: { recordedAt: 'desc' } } } },
      consents: true,
    },
  });

  if (!booking) notFound();

  const caregiver = booking.patient.family.members[0]?.user;
  // The consent script is spoken in the patient's own language, not ours.
  const patientLocale: Locale =
    caregiver?.locale && isLocale(caregiver.locale) ? (caregiver.locale as Locale) : 'en';

  const specimen = booking.specimens[0] ?? null;
  const clock = specimen
    ? readClock({ clockStartsAt: specimen.clockStartsAt, intakeAt: specimen.intakeAt })
    : null;

  const tubes = booking.items.flatMap(
    (i) => i.panel?.items.map((pi) => pi.test) ?? [],
  );
  const uniqueTubes = [...new Map(tubes.map((t) => [t.tubeType, t])).values()];

  return (
    <Page>
      <Stack gap="lg">
        <Stack gap="sm">
          <H1>
            {booking.patient.name}, {booking.patient.ageYears}
          </H1>
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{booking.reference}</Badge>
            <Badge tone={booking.fastingRequired ? 'yellow' : 'neutral'}>
              {booking.fastingRequired ? `${booking.fastingHours}h fasting` : 'no fasting'}
            </Badge>
            {booking.patient.needsProxyConsent && (
              <Badge tone="red">family authorisation required</Badge>
            )}
          </div>
        </Stack>

        <Card>
          <Stack gap="sm">
            <H3>At the door</H3>
            <p className="text-[var(--text-lead)]">
              {booking.address.line1}
              {booking.address.line2 && `, ${booking.address.line2}`}
            </p>
            {booking.address.landmark && (
              <p className="font-semibold">{booking.address.landmark}</p>
            )}
            <Muted>
              {booking.address.city} {booking.address.pincode}
            </Muted>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${booking.address.latitude},${booking.address.longitude}`}
              className="font-semibold underline"
              target="_blank"
              rel="noreferrer"
            >
              Open directions
            </a>
            {caregiver && (
              <Muted>
                Family contact: {caregiver.name} ·{' '}
                <a href={`tel:${caregiver.phone}`} className="underline">
                  {caregiver.phone}
                </a>
              </Muted>
            )}
          </Stack>
        </Card>

        {(booking.patient.conditions ||
          booking.patient.medications ||
          booking.patient.careNotes) && (
          <Card tone="yellow">
            <Stack gap="sm">
              <H3>Before you knock</H3>
              {booking.patient.conditions && (
                <DataRow label="Conditions" value={booking.patient.conditions} />
              )}
              {booking.patient.medications && (
                <DataRow label="Medicines" value={booking.patient.medications} />
              )}
              {booking.patient.careNotes && (
                <p className="font-semibold">{booking.patient.careNotes}</p>
              )}
              <Muted>
                Mobility: {booking.patient.mobility.toLowerCase()}. Do not rush. Sit down. Talk
                first, needle second.
              </Muted>
            </Stack>
          </Card>
        )}

        <Card tone="primary">
          <Stack gap="sm">
            <H3>Say this, in their language</H3>
            <p className="text-[var(--text-lead)]" lang={patientLocale}>
              {t(patientLocale, 'consent.title')}
            </p>
            <p lang={patientLocale}>{t(patientLocale, 'consent.body')}</p>
            <Muted>
              Announce your name, show your ID, and confirm their name aloud before anything
              else.
            </Muted>
          </Stack>
        </Card>

        <Card>
          <Stack gap="sm">
            <H3>What to draw</H3>
            {uniqueTubes.map((test) => (
              <DataRow
                key={test.tubeType}
                label={test.tubeType}
                value={
                  tubes
                    .filter((x) => x.tubeType === test.tubeType)
                    .map((x) => x.code)
                    .join(', ')
                }
              />
            ))}
            <Muted>
              Warm the arm, choose the vein carefully, smallest viable gauge, minimal tourniquet
              time. Fragile veins are a distinct skill.
            </Muted>
          </Stack>
        </Card>

        {clock && specimen && (
          <Card
            tone={
              clock.state === 'BREACHED' ? 'red' : clock.state === 'AMBER' ? 'yellow' : 'green'
            }
          >
            <Stack gap="sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <H3>Time to the lab</H3>
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
              <div className="h-4 w-full overflow-hidden rounded-full bg-[var(--color-surface)]">
                <div
                  className="h-full rounded-full bg-current"
                  style={{ width: `${Math.round(clock.fraction * 100)}%` }}
                />
              </div>
              <Muted>
                Cold box must stay between {COLD_CHAIN_MIN_C} and {COLD_CHAIN_MAX_C} °C, logged
                every few minutes.
              </Muted>
            </Stack>
          </Card>
        )}

        <VisitWorkflow
          bookingId={booking.id}
          patientName={booking.patient.name}
          patientAge={booking.patient.ageYears}
          reference={booking.reference}
          needsProxyConsent={booking.patient.needsProxyConsent}
          status={booking.status}
          labId={booking.labId ?? ''}
          labName={booking.lab?.name ?? 'the laboratory'}
          hasConsent={booking.consents.some(
            (c) => c.purpose === 'SAMPLE_COLLECTION' && c.granted,
          )}
          specimen={
            specimen
              ? {
                  id: specimen.id,
                  barcode: specimen.barcode,
                  intakeAt: specimen.intakeAt?.toISOString() ?? null,
                  latestTemperature: specimen.coldChainLogs[0]?.temperatureC ?? null,
                  sealed: specimen.coldChainLogs[0]?.boxSealed ?? false,
                }
              : null
          }
          tubeTypes={uniqueTubes.map((t) => t.tubeType)}
          steps={CHECKLIST_STEPS.map((step) => {
            const row = booking.checklistSteps.find((s) => s.stepKey === step.key);
            return {
              key: step.key,
              label: step.label,
              sequence: step.sequence,
              blocking: step.blocking,
              actor: step.actor,
              completedAt: row?.completedAt?.toISOString() ?? null,
            };
          })}
        />
      </Stack>
    </Page>
  );
}
