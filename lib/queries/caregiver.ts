import 'server-only';
import { db } from '../db';
import { requireRole, type SessionUser } from '../auth/session';

/**
 * The caregiver's family, with everything the dashboard needs in one round
 * trip. Scoped by membership: a caregiver can only ever reach the family they
 * belong to, which is the access-control boundary for every health record in
 * the app.
 */
export async function loadFamilyContext(user?: SessionUser) {
  const session = user ?? (await requireRole('CAREGIVER'));

  const membership = await db.familyMember.findFirst({
    where: { userId: session.id },
    include: {
      family: {
        include: {
          patients: {
            where: { isActive: true },
            include: {
              addresses: true,
              abhaAccount: true,
              subscriptions: {
                where: { status: { in: ['ACTIVE', 'PENDING', 'PAST_DUE'] } },
                include: {
                  plan: true,
                  mandate: true,
                  assignedTechnician: { include: { user: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  return { session, membership, family: membership?.family ?? null };
}

export async function loadUpcomingVisits(familyId: string) {
  return db.booking.findMany({
    where: {
      familyId,
      status: { in: ['REQUESTED', 'SCHEDULED', 'EN_ROUTE', 'ARRIVED'] },
      windowEnd: { gte: new Date(Date.now() - 6 * 3_600_000) },
    },
    orderBy: { windowStart: 'asc' },
    include: {
      patient: true,
      address: true,
      technician: { include: { user: true } },
      items: { include: { panel: true, test: true } },
      trackingSessions: { where: { revokedAt: null }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
}

export async function loadReportTimeline(familyId: string) {
  return db.report.findMany({
    where: { status: 'RELEASED', booking: { familyId } },
    orderBy: { releasedAt: 'desc' },
    include: {
      patient: true,
      lab: true,
      booking: true,
      criticals: true,
      followUps: true,
      parameters: { include: { test: true } },
    },
  });
}

export async function loadCallHistory(familyId: string) {
  return db.followUpCall.findMany({
    where: { booking: { familyId } },
    orderBy: [{ status: 'asc' }, { dueBy: 'desc' }],
    include: { report: { include: { patient: true } }, placedBy: true },
  });
}

/** A caregiver may only open a booking that belongs to their own family. */
export async function assertBookingBelongsToUser(bookingId: string, userId: string) {
  const booking = await db.booking.findFirst({
    where: { id: bookingId, family: { members: { some: { userId } } } },
    include: {
      patient: true,
      address: true,
      technician: { include: { user: true } },
      route: true,
      lab: true,
      zone: true,
      items: { include: { panel: true, test: true } },
    },
  });
  return booking;
}
