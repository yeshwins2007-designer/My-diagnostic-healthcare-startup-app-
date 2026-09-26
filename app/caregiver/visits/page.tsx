import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import {
  loadFamilyContext,
  loadInProgressVisits,
  loadUpcomingVisits,
} from '@/lib/queries/caregiver';
import { SampleJourney } from '@/components/sample-journey';
import { classifyArrival, fastingInstruction } from '@/lib/sop/visitWindow';
import { BookVisitForm } from '@/components/book-visit-form';
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

export const metadata: Metadata = { title: 'Visits' };
export const dynamic = 'force-dynamic';

function timeLabel(d: Date) {
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export default async function VisitsPage() {
  const { family } = await loadFamilyContext();
  if (!family) redirect('/caregiver/onboarding');

  const [upcoming, inProgress, past, panels] = await Promise.all([
    loadUpcomingVisits(family.id),
    loadInProgressVisits(family.id),
    db.booking.findMany({
      where: { familyId: family.id, status: { in: ['CLOSED', 'REPORTED', 'CANCELLED'] } },
      orderBy: { windowStart: 'desc' },
      take: 10,
      include: { patient: true, technician: { include: { user: true } } },
    }),
    db.panel.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
  ]);

  return (
    <Page>
      <Stack gap="lg">
        <Stack gap="sm">
          <H1>Visits</H1>
          <Lead>
            We promise a sixty-minute window, not a countdown. If we are going to miss it, we
            call you before it ends.
          </Lead>
        </Stack>

        <Stack gap="md">
          <H2>Coming up</H2>
          {upcoming.length === 0 ? (
            <EmptyState
              title="Nothing booked"
              body="Choose a morning below. Booking takes about a minute."
            />
          ) : (
            upcoming.map((booking) => (
              <Card key={booking.id}>
                <Stack gap="sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <H3>{booking.patient.name}</H3>
                    <div className="flex gap-2">
                      <Badge tone="neutral">{booking.reference}</Badge>
                      {booking.delayNotifiedAt && <Badge tone="yellow">running late</Badge>}
                    </div>
                  </div>
                  <p className="text-lead">
                    {booking.windowStart.toLocaleDateString('en-IN', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                    , {timeLabel(booking.windowStart)} – {timeLabel(booking.windowEnd)}
                  </p>
                  {booking.technician && (
                    <p>{booking.technician.user.name} is coming.</p>
                  )}
                  {/* Only once something is moving; for a visit that is merely
                      booked, five mostly-empty steps are noise. */}
                  {(booking.status === 'EN_ROUTE' || booking.status === 'ARRIVED') && (
                    <SampleJourney status={booking.status} />
                  )}
                  {booking.fastingRequired && (
                    <Card tone="yellow" className="p-4">
                      <p>{fastingInstruction(booking.fastingHours, booking.windowStart)}</p>
                    </Card>
                  )}
                  {(booking.status === 'EN_ROUTE' || booking.status === 'ARRIVED') && (
                    <Link
                      href={`/caregiver/track/${booking.id}`}
                      className="font-semibold underline"
                    >
                      See where they are
                    </Link>
                  )}
                </Stack>
              </Card>
            ))
          )}
        </Stack>

        {inProgress.length > 0 && (
          <Stack gap="md">
            <H2>Sample in progress</H2>
            {inProgress.map((booking) =>
              booking.status === 'RECOLLECTION_REQUIRED' ? (
                // Not progress, so not drawn as progress: the lab could not use
                // the sample and a second draw is needed. Saying so plainly is
                // kinder than a stepper that has quietly stopped moving.
                <Card key={booking.id} tone="yellow">
                  <Stack gap="sm">
                    <H3>{booking.patient.name}</H3>
                    <p>
                      The laboratory could not process this sample as it was drawn, so a
                      second one is needed. We will call you to arrange the visit.
                    </p>
                    <Muted>Reference {booking.reference}</Muted>
                  </Stack>
                </Card>
              ) : (
                <Card key={booking.id} elevated>
                  <Stack gap="md">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <H3>{booking.patient.name}</H3>
                      <Badge tone="neutral" variant="tonal">
                        {booking.reference}
                      </Badge>
                    </div>
                    <Muted>
                      Collected{' '}
                      {booking.windowStart.toLocaleDateString('en-IN', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      })}
                      {booking.technician && ` by ${booking.technician.user.name}`}
                      {booking.lab && `, tested at ${booking.lab.name}`}.
                    </Muted>
                    <SampleJourney status={booking.status} />
                  </Stack>
                </Card>
              ),
            )}
          </Stack>
        )}

        <Stack gap="md">
          {/* "Extra" only once there is a visit for it to be extra to. */}
          <H2>
            {upcoming.length + inProgress.length + past.length === 0
              ? 'Book the first visit'
              : 'Book an extra visit'}
          </H2>
          <Muted>
            Included in your plan at no extra charge. We will only offer slots inside the
            morning window, because that is when fasting samples work and when our routes run.
          </Muted>
          <BookVisitForm
            patients={family.patients.map((p) => ({ id: p.id, name: p.name }))}
            panels={panels.map((p) => ({
              id: p.id,
              name: p.name,
              description: p.description,
              fastingHours: p.fastingHours,
            }))}
          />
        </Stack>

        {past.length > 0 && (
          <Stack gap="md">
            <H2>Past visits</H2>
            {past.map((booking) => {
              const arrival = classifyArrival(booking);
              return (
                <Card key={booking.id} tone="sunken">
                  <Stack gap="sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-semibold">
                        {booking.patient.name} ·{' '}
                        {booking.windowStart.toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'long',
                        })}
                      </p>
                      <Badge tone={arrival === 'LATE' ? 'yellow' : 'green'}>
                        {arrival === 'LATE'
                          ? 'arrived after the window'
                          : arrival === 'PENDING'
                            ? booking.status.toLowerCase()
                            : 'arrived on time'}
                      </Badge>
                    </div>
                    <Muted>
                      {booking.technician?.user.name ?? 'unassigned'} · {booking.reference}
                    </Muted>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Page>
  );
}
