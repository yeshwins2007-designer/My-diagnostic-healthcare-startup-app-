import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { assertBookingBelongsToUser } from '@/lib/queries/caregiver';
import { loadRouteGeometry } from '@/app/actions/caregiver';
import { env, providerMode } from '@/lib/env';
import { TrackingMap } from '@/components/tracking-map';
import {
  Card,
  H1,
  H3,
  Lead,
  Muted,
  Page,
  SimulatedChip,
  Stack,
} from '@/components/ui';

export const metadata: Metadata = { title: 'Where they are' };
export const dynamic = 'force-dynamic';

export default async function TrackPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const user = await requireRole('CAREGIVER');
  const booking = await assertBookingBelongsToUser(bookingId, user.id);
  if (!booking) notFound();

  const routePoints = await loadRouteGeometry(bookingId);

  return (
    <Page>
      <Stack gap="lg">
        <Stack gap="sm">
          <H1>Where they are</H1>
          <Lead>
            {booking.technician?.user.name ?? 'Your technician'} is on the way to{' '}
            {booking.patient.name}.
          </Lead>
          {providerMode.maps === 'simulated' && <SimulatedChip what="maps" />}
        </Stack>

        <TrackingMap
          bookingId={booking.id}
          apiKey={env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
          routePoints={routePoints}
          destination={{
            lat: booking.address.latitude,
            lng: booking.address.longitude,
          }}
          technicianName={booking.technician?.user.name ?? null}
        />

        <Card>
          <Stack gap="sm">
            <H3>The address they are coming to</H3>
            <p>
              {booking.address.line1}
              {booking.address.line2 && `, ${booking.address.line2}`}
            </p>
            {booking.address.landmark && (
              <p className="font-semibold">{booking.address.landmark}</p>
            )}
            <Muted>
              {booking.address.city} {booking.address.pincode}
              {booking.address.pinnedManually && ' · location pinned by hand'}
            </Muted>
          </Stack>
        </Card>

        <Card tone="sunken">
          <Stack gap="sm">
            <H3>About this link</H3>
            <Muted>
              This tracking view works only during today’s visit and stops shortly after it. We
              do not keep a running record of where our technicians are — their positions are
              recorded only between starting and ending a morning route, and the detailed
              records are erased after {env.PING_RETENTION_DAYS} days.
            </Muted>
          </Stack>
        </Card>
      </Stack>
    </Page>
  );
}
