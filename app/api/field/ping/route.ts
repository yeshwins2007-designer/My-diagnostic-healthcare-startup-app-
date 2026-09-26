import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import { audit } from '@/lib/compliance/audit';
import { projectArrival } from '@/lib/sop/visitWindow';
import { isRefusal } from '@/lib/sop/types';
import { getSmsProvider } from '@/lib/providers/sms';

/**
 * GPS ingest for the field agent app.
 *
 * The privacy rule is enforced here, server-side, not in the client: a ping is
 * accepted ONLY between route-start and route-end. Off-shift positions are
 * rejected outright and the rejection is itself audited — a technician's
 * movements outside their working morning are none of this system's business.
 *
 * The same handler runs the delay rule: the moment the projection says the
 * promised window will be missed, the family is messaged before the window
 * ends. A call before a delay is forgivable; silence is not.
 */

const pingSchema = z.object({
  routeId: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyM: z.number().optional(),
  headingDeg: z.number().optional(),
  speedKmh: z.number().optional(),
});

export async function POST(request: Request) {
  const user = await requireRole('TECHNICIAN');

  const parsed = pingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid ping.' }, { status: 400 });
  }

  const route = await db.route.findFirst({
    where: { id: parsed.data.routeId, technician: { userId: user.id } },
    include: { bookings: { include: { address: true } } },
  });

  if (!route) {
    return NextResponse.json({ error: 'Route not found.' }, { status: 404 });
  }

  // The whole privacy posture, in one condition.
  const onShift = route.status === 'STARTED' && route.startedAt !== null && route.endedAt === null;

  if (!onShift) {
    await audit({
      action: 'LOCATION_PING_REJECTED',
      entityType: 'Route',
      entityId: route.id,
      actorUserId: user.id,
      actorRole: 'TECHNICIAN',
      detail: { reason: 'off_shift', routeStatus: route.status },
    });
    return NextResponse.json(
      {
        error: 'Location is only recorded between starting and ending a route.',
        recorded: false,
      },
      { status: 409 },
    );
  }

  const ping = await db.locationPing.create({
    data: {
      routeId: route.id,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      accuracyM: parsed.data.accuracyM ?? null,
      headingDeg: parsed.data.headingDeg ?? null,
      speedKmh: parsed.data.speedKmh ?? null,
    },
  });

  // Delay pre-notification, for the next visit on the route.
  const nextVisit = route.bookings
    .filter((b) => ['SCHEDULED', 'EN_ROUTE'].includes(b.status))
    .sort((a, b) => a.windowStart.getTime() - b.windowStart.getTime())[0];

  let notified = false;

  if (nextVisit) {
    const check = projectArrival({
      technicianPosition: { lat: parsed.data.latitude, lng: parsed.data.longitude },
      destination: {
        lat: nextVisit.address.latitude,
        lng: nextVisit.address.longitude,
      },
      windowEnd: nextVisit.windowEnd,
      alreadyNotified: nextVisit.delayNotifiedAt !== null,
    });

    if (isRefusal(check.decision)) {
      const family = await db.familyMember.findFirst({
        where: { familyId: nextVisit.familyId },
        include: { user: true },
      });

      if (family) {
        await getSmsProvider().sendWhatsApp(
          family.user.phone,
          `We are running about ${check.minutesLate} minutes behind for this morning's visit. We are sorry — we wanted to tell you before your slot ended rather than after. Your technician is on the way.`,
        );
      }

      await db.booking.update({
        where: { id: nextVisit.id },
        data: { delayNotifiedAt: new Date() },
      });
      notified = true;
    }
  }

  return NextResponse.json({
    recorded: true,
    pingId: ping.id,
    delayNotificationSent: notified,
  });
}
