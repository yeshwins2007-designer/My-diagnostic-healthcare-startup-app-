import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { classifyArrival, ROUTE_FIX_DEADLINE_HOUR } from '@/lib/sop/visitWindow';
import { readClock } from '@/lib/sop/sampleClock';
import { RouteControls } from '@/components/route-controls';
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

export const metadata: Metadata = { title: 'Today’s route' };
export const dynamic = 'force-dynamic';

function timeLabel(d: Date) {
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export default async function FieldHome() {
  const user = await requireRole('TECHNICIAN');

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const technician = await db.technician.findUnique({
    where: { userId: user.id },
    include: { zone: true },
  });
  if (!technician) {
    return (
      <Page>
        <EmptyState
          title="No technician profile"
          body="Ask the coordinator to finish setting up your account."
        />
      </Page>
    );
  }

  const route = await db.route.findFirst({
    where: { technicianId: technician.id, serviceDate: { gte: startOfDay } },
    include: {
      bookings: {
        orderBy: { windowStart: 'asc' },
        include: {
          patient: true,
          address: true,
          specimens: { include: { coldChainLogs: { orderBy: { recordedAt: 'desc' }, take: 1 } } },
          items: { include: { panel: true } },
        },
      },
    },
  });

  const inTransit =
    route?.bookings.flatMap((b) =>
      b.specimens.filter((s) => s.clockStartsAt && !s.intakeAt).map((s) => ({ booking: b, specimen: s })),
    ) ?? [];

  return (
    <Page>
      <Stack gap="lg">
        <Stack gap="sm">
          <H1>Good morning, {user.name.split(' ')[0]}</H1>
          {route ? (
            <Lead>
              {route.bookings.length} visit{route.bookings.length === 1 ? '' : 's'} ·{' '}
              {route.plannedDistanceKm?.toFixed(1) ?? '—'} km · {technician.zone?.name}
            </Lead>
          ) : (
            <Lead>No route is planned for today.</Lead>
          )}
          <Muted>
            Routes are fixed before {ROUTE_FIX_DEADLINE_HOUR === 6.5 ? '6:30' : ROUTE_FIX_DEADLINE_HOUR}{' '}
            AM — shortest path, densest cluster first.
          </Muted>
        </Stack>

        {route && (
          <RouteControls
            routeId={route.id}
            status={route.status}
            startedAt={route.startedAt?.toISOString() ?? null}
          />
        )}

        {inTransit.length > 0 && (
          <Stack gap="md">
            <H2>Get these to the lab</H2>
            {inTransit.map(({ booking, specimen }) => {
              const reading = readClock({
                clockStartsAt: specimen.clockStartsAt,
                intakeAt: specimen.intakeAt,
              });
              const tone =
                reading.state === 'BREACHED' ? 'red' : reading.state === 'AMBER' ? 'yellow' : 'green';
              return (
                <Card key={specimen.id} tone={tone}>
                  <Stack gap="sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <H3>{booking.patient.name}</H3>
                      <Badge tone={tone}>{reading.label}</Badge>
                    </div>
                    <Muted>
                      {specimen.barcode} · last temperature{' '}
                      {specimen.coldChainLogs[0]
                        ? `${specimen.coldChainLogs[0].temperatureC.toFixed(1)} °C`
                        : 'NOT LOGGED'}
                    </Muted>
                    <Link
                      href={`/field/visit/${booking.id}`}
                      className="font-semibold underline"
                    >
                      Open the visit
                    </Link>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        )}

        <Stack gap="md">
          <H2>Visits</H2>
          {!route || route.bookings.length === 0 ? (
            <EmptyState
              title="Nothing scheduled"
              body="Your route for tomorrow morning will appear here by 6:30 AM."
            />
          ) : (
            route.bookings.map((booking, index) => {
              const arrival = classifyArrival(booking);
              const done = ['COLLECTED', 'IN_TRANSIT', 'AT_LAB', 'CLOSED'].includes(
                booking.status,
              );
              return (
                <Link key={booking.id} href={`/field/visit/${booking.id}`}>
                  <Card tone={done ? 'sunken' : 'surface'}>
                    <Stack gap="sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <H3>
                          {index + 1}. {booking.patient.name}, {booking.patient.ageYears}
                        </H3>
                        <div className="flex gap-2">
                          {booking.fastingRequired && <Badge tone="yellow">fasting</Badge>}
                          {arrival === 'LATE' && <Badge tone="red">late</Badge>}
                          <Badge tone={done ? 'green' : 'neutral'}>
                            {booking.status.replace(/_/g, ' ').toLowerCase()}
                          </Badge>
                        </div>
                      </div>

                      <p className="text-[var(--text-lead)]">
                        {timeLabel(booking.windowStart)} – {timeLabel(booking.windowEnd)}
                      </p>

                      <p>
                        {booking.address.line1}
                        {booking.address.landmark && (
                          <span className="block font-semibold">
                            {booking.address.landmark}
                          </span>
                        )}
                      </p>

                      {booking.address.pinnedManually && (
                        <Badge tone="yellow">
                          location pinned by hand — call ahead if unsure
                        </Badge>
                      )}

                      {booking.patient.careNotes && (
                        <p className="rounded-[var(--radius-control)] bg-[var(--color-yellow-wash)] p-3">
                          {booking.patient.careNotes}
                        </p>
                      )}

                      <Muted>
                        {booking.items.map((i) => i.panel?.name).filter(Boolean).join(', ')}
                        {booking.patient.mobility !== 'INDEPENDENT' &&
                          ` · ${booking.patient.mobility.toLowerCase()} — allow extra time`}
                      </Muted>
                    </Stack>
                  </Card>
                </Link>
              );
            })
          )}
        </Stack>

        <Card tone="sunken">
          <Stack gap="sm">
            <H3>Never, on any visit</H3>
            <ul className="flex list-disc flex-col gap-2 pl-6">
              <li>Never interpret a result.</li>
              <li>Never suggest a medicine or a change to one.</li>
              <li>Never comment on a diagnosis.</li>
              <li>Never label a vial anywhere except at the bedside.</li>
            </ul>
            <Muted>Warm and helpful, medically silent. If in doubt, call the coordinator.</Muted>
          </Stack>
        </Card>
      </Stack>
    </Page>
  );
}
