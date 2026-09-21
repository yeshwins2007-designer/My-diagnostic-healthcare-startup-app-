import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/db';
import { readClock, budgetForSpecimens } from '@/lib/sop/sampleClock';
import { classifyArrival } from '@/lib/sop/visitWindow';
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

export const metadata: Metadata = { title: 'Today' };
export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, 'green' | 'yellow' | 'red' | 'info' | 'neutral'> = {
  SCHEDULED: 'neutral',
  EN_ROUTE: 'info',
  ARRIVED: 'info',
  COLLECTED: 'info',
  IN_TRANSIT: 'yellow',
  AT_LAB: 'green',
  PROCESSING: 'green',
  REPORTED: 'green',
  CLOSED: 'green',
  CANCELLED: 'neutral',
  RECOLLECTION_REQUIRED: 'red',
};

function timeLabel(d: Date) {
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export default async function OpsTodayPage() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);

  const bookings = await db.booking.findMany({
    where: { windowStart: { gte: startOfDay, lt: endOfDay } },
    orderBy: { windowStart: 'asc' },
    include: {
      patient: true,
      address: true,
      technician: { include: { user: true } },
      lab: true,
      specimens: {
        include: {
          coldChainLogs: { orderBy: { recordedAt: 'desc' }, take: 1 },
        },
      },
      items: { include: { panel: { include: { items: { include: { test: true } } } } } },
    },
  });

  // Anything in transit is on a two-hour clock, so it leads the page.
  const inTransit = bookings.filter((b) =>
    b.specimens.some((s) => s.clockStartsAt && !s.intakeAt),
  );

  return (
    <Page wide>
      <Stack gap="lg">
        <Stack gap="sm">
          <H1>Today</H1>
          <Lead>
            {bookings.length} visit{bookings.length === 1 ? '' : 's'} scheduled. Samples in
            transit are on the two-hour clock.
          </Lead>
        </Stack>

        {inTransit.length > 0 && (
          <Stack gap="md">
            <H2>On the clock</H2>
            {inTransit.map((booking) => {
              const specimen = booking.specimens.find((s) => s.clockStartsAt && !s.intakeAt)!;
              const stabilities = booking.items
                .flatMap((i) => i.panel?.items.map((pi) => pi.test.stabilityHours) ?? [])
                .filter(Boolean);
              const reading = readClock({
                clockStartsAt: specimen.clockStartsAt,
                intakeAt: specimen.intakeAt,
                budgetMinutes: budgetForSpecimens(stabilities),
              });
              const tone =
                reading.state === 'BREACHED'
                  ? 'red'
                  : reading.state === 'AMBER'
                    ? 'yellow'
                    : 'green';

              return (
                <Card key={booking.id} tone={tone}>
                  <Stack gap="sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <H3>{booking.patient.name}</H3>
                      <Badge tone={tone}>{reading.label}</Badge>
                    </div>
                    <div className="h-4 w-full overflow-hidden rounded-full bg-[var(--color-surface)]">
                      <div
                        className="h-full rounded-full bg-current transition-[width]"
                        style={{ width: `${Math.round(reading.fraction * 100)}%` }}
                      />
                    </div>
                    <Muted>
                      Collected {timeLabel(specimen.clockStartsAt!)} · {specimen.barcode} ·{' '}
                      {booking.technician?.user.name} · to {booking.lab?.name} · last cold-box
                      reading{' '}
                      {specimen.coldChainLogs[0]
                        ? `${specimen.coldChainLogs[0].temperatureC.toFixed(1)} °C`
                        : 'not logged'}
                    </Muted>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        )}

        <Stack gap="md">
          <H2>All visits today</H2>
          {bookings.length === 0 ? (
            <EmptyState
              title="Nothing scheduled today"
              body="Bookings appear here as soon as they are confirmed."
            />
          ) : (
            <Stack gap="sm">
              {bookings.map((booking) => {
                const arrival = classifyArrival(booking);
                return (
                  <Card key={booking.id} as="article">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <Stack gap="sm" className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <H3 className="text-[var(--text-lead)]">{booking.patient.name}</H3>
                          <Badge tone={STATUS_TONE[booking.status] ?? 'neutral'}>
                            {booking.status.replace(/_/g, ' ').toLowerCase()}
                          </Badge>
                          {booking.intakeChannel !== 'APP' && (
                            <Badge>via {booking.intakeChannel.toLowerCase()}</Badge>
                          )}
                          {arrival === 'LATE' && <Badge tone="red">arrived late</Badge>}
                          {booking.radiusOverride && <Badge tone="yellow">radius override</Badge>}
                        </div>
                        <Muted>
                          {timeLabel(booking.windowStart)} – {timeLabel(booking.windowEnd)} ·{' '}
                          {booking.technician?.user.name ?? 'unassigned'} ·{' '}
                          {booking.address.line1}
                          {booking.address.landmark && ` (${booking.address.landmark})`}
                        </Muted>
                        {booking.patient.careNotes && (
                          <p className="rounded-[var(--radius-control)] bg-[var(--color-yellow-wash)] p-3 text-[var(--text-small)]">
                            {booking.patient.careNotes}
                          </p>
                        )}
                      </Stack>
                      <Link
                        href={`/ops/booking/${booking.id}`}
                        className="shrink-0 font-semibold underline"
                      >
                        Open
                      </Link>
                    </div>
                  </Card>
                );
              })}
            </Stack>
          )}
        </Stack>
      </Stack>
    </Page>
  );
}
