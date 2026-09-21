import { db } from '@/lib/db';
import { getSessionUser } from '@/lib/auth/session';
import { hashToken } from '@/lib/compliance/crypto';
import { haversineKm, estimateMinutes } from '@/lib/geo';
import { classifyArrival } from '@/lib/sop/visitWindow';

export const dynamic = 'force-dynamic';

/**
 * Live tracking, over Server-Sent Events.
 *
 * Access is either a family member's session or a signed single-visit token
 * that expires thirty minutes after the promised window. There is deliberately
 * no permanent tracking URL: continuous location of a health worker entering
 * identified patients' homes is a liability, and the exposure here is bounded
 * by construction rather than by policy.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params;
  const url = new URL(request.url);
  const token = url.searchParams.get('t');

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      address: true,
      technician: { include: { user: true } },
      route: true,
      family: { include: { members: true } },
    },
  });

  if (!booking) return new Response('Not found', { status: 404 });

  let authorised = false;

  const user = await getSessionUser();
  if (user && booking.family.members.some((m) => m.userId === user.id)) {
    authorised = true;
  }

  if (!authorised && token) {
    const session = await db.trackingSession.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (
      session &&
      session.bookingId === bookingId &&
      !session.revokedAt &&
      session.expiresAt > new Date()
    ) {
      authorised = true;
      await db.trackingSession.update({
        where: { id: session.id },
        data: { lastViewedAt: new Date(), viewCount: { increment: 1 } },
      });
    }
  }

  if (!authorised) return new Response('Not authorised', { status: 403 });

  const destination = { lat: booking.address.latitude, lng: booking.address.longitude };

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const send = (data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const tick = async () => {
        if (closed) return;

        const fresh = await db.booking.findUnique({
          where: { id: bookingId },
          include: {
            route: {
              include: { pings: { orderBy: { recordedAt: 'desc' }, take: 1 } },
            },
          },
        });

        const ping = fresh?.route?.pings[0];
        const position = ping ? { lat: ping.latitude, lng: ping.longitude } : null;
        const distanceKm = position ? haversineKm(position, destination) : null;

        send({
          status: fresh?.status ?? booking.status,
          position,
          bearingDeg: ping?.headingDeg ?? null,
          destination,
          distanceKm,
          etaMinutes: distanceKm === null ? null : estimateMinutes(distanceKm),
          arrival: classifyArrival({
            windowStart: booking.windowStart,
            windowEnd: booking.windowEnd,
            arrivedAt: fresh?.arrivedAt ?? null,
          }),
          delayNotifiedAt: fresh?.delayNotifiedAt ?? null,
          technicianName: booking.technician?.user.name ?? null,
          updatedAt: new Date().toISOString(),
        });

        // The stream dies with the visit, not when the browser gets bored.
        if (
          fresh &&
          ['COLLECTED', 'IN_TRANSIT', 'AT_LAB', 'CLOSED', 'CANCELLED'].includes(fresh.status)
        ) {
          send({ ended: true, reason: 'The visit is complete.' });
          closed = true;
          controller.close();
        }
      };

      await tick();
      const interval = setInterval(() => void tick(), 4000);

      // Hard stop once the tracking window closes, even if nothing else fires.
      const deadline = booking.windowEnd.getTime() + 30 * 60_000 - Date.now();
      const timeout = setTimeout(
        () => {
          if (closed) return;
          send({ ended: true, reason: 'The tracking link has expired.' });
          closed = true;
          controller.close();
        },
        Math.max(60_000, Math.min(deadline, 3 * 3_600_000)),
      );

      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        clearTimeout(timeout);
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed; nothing to do.
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
