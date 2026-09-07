import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { loadFamilyContext, loadUpcomingVisits } from '@/lib/queries/caregiver';
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

  const [upcoming, past, panels] = await Promise.all([
    loadUpcomingVisits(family.id),
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
              title="Nothing scheduled"
              body="Your plan schedules visits automatically. You can also book an extra one below."
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
                  <p className="text-[var(--text-lead)]">
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

        <Stack gap="md">
          <H2>Book an extra visit</H2>
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
