/**
 * Replays a technician's morning along the seeded route so the caregiver's
 * tracking screen genuinely moves.
 *
 * This exists because a tracking feature you cannot watch working is a
 * tracking feature you cannot test. It writes real LocationPing rows through
 * the same table the live app reads, so nothing about the rendering path is
 * special-cased for the demo.
 *
 * Run:  npm run demo:track
 * Then: open /caregiver/track/<bookingId> as the caregiver.
 */

import { PrismaClient } from '@prisma/client';
import { decodePolyline, interpolateAlongPath, bearing, haversineKm } from '../lib/geo';

const db = new PrismaClient();

const STEP_SECONDS = 3;
const TOTAL_STEPS = 60;

async function main() {
  const route = await db.route.findFirst({
    where: { status: 'STARTED' },
    include: {
      technician: { include: { user: true } },
      bookings: {
        where: { status: { in: ['EN_ROUTE', 'SCHEDULED', 'ARRIVED'] } },
        include: { address: true, patient: true },
        orderBy: { windowStart: 'asc' },
      },
    },
  });

  if (!route) {
    console.error('No started route found. Run `npm run seed` first.');
    process.exit(1);
  }
  if (!route.encodedPolyline) {
    console.error('That route has no polyline.');
    process.exit(1);
  }

  const path = decodePolyline(route.encodedPolyline);
  const target = route.bookings[0];

  console.log(`
Replaying ${route.technician.user.name}'s morning route.

  Route      ${route.id}
  Heading to ${target ? `${target.patient.name} — ${target.address.line1}` : 'no active booking'}
  ${target ? `Open      /caregiver/track/${target.id}` : ''}

Streaming a position every ${STEP_SECONDS}s for ${(TOTAL_STEPS * STEP_SECONDS) / 60} minutes.
Press Ctrl-C to stop.
`);

  // Clear any previous replay so repeated runs do not stack up.
  await db.locationPing.deleteMany({ where: { routeId: route.id } });

  for (let step = 0; step <= TOTAL_STEPS; step++) {
    const t = step / TOTAL_STEPS;
    const { position } = interpolateAlongPath(path, t);
    const nextPoint = interpolateAlongPath(path, Math.min(1, t + 0.02)).position;

    await db.locationPing.create({
      data: {
        routeId: route.id,
        latitude: position.lat,
        longitude: position.lng,
        accuracyM: 8 + Math.random() * 6,
        headingDeg: bearing(position, nextPoint),
        speedKmh: 14 + Math.random() * 10,
      },
    });

    if (target) {
      const distanceKm = haversineKm(position, {
        lat: target.address.latitude,
        lng: target.address.longitude,
      });
      process.stdout.write(
        `\r  ${String(step).padStart(2)}/${TOTAL_STEPS}  ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}  ${distanceKm.toFixed(2)} km from the door   `,
      );

      // Mark arrival when the technician is genuinely at the door, so the
      // on-time metric is driven by the replay rather than hardcoded.
      if (distanceKm < 0.08 && !target.arrivedAt) {
        await db.booking.update({
          where: { id: target.id },
          data: { status: 'ARRIVED', arrivedAt: new Date() },
        });
        console.log(`\n\n  Arrived at ${target.patient.name}'s door.\n`);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, STEP_SECONDS * 1000));
  }

  console.log('\n\nReplay finished.\n');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
