/**
 * Deleting an account.
 *
 * App Store and Google Play both require that an account made in the app can
 * be deleted in the app, and India's DPDP Act gives every person the right to
 * have their data erased. A health service also has records it must keep, so
 * deletion happens in two steps:
 *
 *   1. Now (closeAccount): the account stops working. Signed out on every
 *      device, passkeys removed, the Medwyn One membership cancelled, unpaid
 *      bookings cancelled, and our team told.
 *   2. After ERASE_AFTER_DAYS (eraseAccount, run by scripts/retention-purge.ts):
 *      everything that identifies the person and their parents is erased or
 *      blanked: names, phone, email, password, addresses, care notes,
 *      conditions, medicines, health-account links, Elder Mode devices.
 *
 * What stays, without the personal details, because the law requires it:
 * the laboratory's signed reports (a lab must keep its records), payment and
 * tax records, and the tamper-evident audit log. The privacy policy says so.
 *
 * Partner accounts are different: a lab may have samples in hand, so asking
 * to close one opens a ticket for our partnerships team instead.
 */

// Not 'server-only': the retention job (a plain script) runs eraseDueAccounts.
import { db } from '../db';
import { audit } from '../compliance/audit';
import { coarsen } from '../geo';

export const ERASE_AFTER_DAYS = 30;

/** Booking states where a sample or a report is still on its way. */
const IN_FLIGHT = ['SCHEDULED', 'EN_ROUTE', 'ARRIVED', 'COLLECTED', 'IN_TRANSIT', 'AT_LAB', 'PROCESSING'];

export type CloseResult =
  | { ok: true; closed: boolean; message: string }
  | { ok: false; message: string };

export async function closeAccount(userId: string, now = new Date()): Promise<CloseResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { families: true, labMemberships: { include: { lab: true } } },
  });
  if (!user || !user.isActive) return { ok: false, message: 'This account is already closed.' };

  if (user.role === 'LAB') {
    await db.supportTicket.create({
      data: {
        raisedByUserId: user.id,
        source: 'APP',
        category: 'ACCOUNT_DELETION',
        subject: `Close partner account: ${user.name}${user.labMemberships[0] ? ` (${user.labMemberships[0].lab.name})` : ''}`,
        body: 'Asked in the partner app. Finish any samples in hand, then close the account and erase personal details.',
        priority: 'HIGH',
      },
    });
    await audit({ action: 'ACCOUNT_DELETION_REQUESTED', entityType: 'User', entityId: user.id, actorUserId: user.id, actorRole: user.role, detail: { kind: 'partner' } });
    return {
      ok: true,
      closed: false,
      message: `Our partnerships team will close your account within ${ERASE_AFTER_DAYS} days, once any samples already with you are finished. We’ll call you to confirm.`,
    };
  }
  if (user.role !== 'CAREGIVER') {
    return { ok: false, message: 'Staff accounts are closed by our team. Please ask your manager.' };
  }

  const familyIds = user.families.map((f) => f.familyId);
  const inFlight = await db.booking.findFirst({
    where: { familyId: { in: familyIds }, status: { in: IN_FLIGHT } },
    orderBy: { windowStart: 'asc' },
  });
  if (inFlight) {
    return {
      ok: false,
      message: `Your visit ${inFlight.reference} is still under way. Once its report is out you can delete your account, or cancel the visit first.`,
    };
  }

  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { isActive: false, deletionRequestedAt: now } }),
    db.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } }),
    db.passkey.deleteMany({ where: { userId: user.id } }),
    db.subscription.updateMany({
      where: { familyId: { in: familyIds }, status: { in: ['ACTIVE', 'PENDING'] } },
      data: { status: 'CANCELLED', cancelledAt: now, cancelReason: 'Account deleted by the family in the app' },
    }),
    db.booking.updateMany({
      where: { familyId: { in: familyIds }, status: 'AWAITING_PAYMENT' },
      data: { status: 'CANCELLED', cancelledAt: now, cancelReason: 'Account deleted' },
    }),
    db.supportTicket.create({
      data: {
        raisedByUserId: user.id,
        source: 'APP',
        category: 'ACCOUNT_DELETION',
        subject: `Account deleted: erase on ${new Date(now.getTime() + ERASE_AFTER_DAYS * 86_400_000).toISOString().slice(0, 10)}`,
        body: 'Closed in the app. Personal details are erased automatically after the grace period. Check for refunds owed.',
        priority: 'NORMAL',
      },
    }),
  ]);
  await audit({ action: 'ACCOUNT_DELETION_REQUESTED', entityType: 'User', entityId: user.id, actorUserId: user.id, actorRole: user.role, detail: { kind: 'family' } });
  return { ok: true, closed: true, message: 'Your account is closed.' };
}

/**
 * Erase what identifies a closed family account. Idempotent. Records the law
 * requires stay, now attached to blanked names.
 */
export async function eraseAccount(userId: string, now = new Date()): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, include: { families: true } });
  if (!user || user.erasedAt || !user.deletionRequestedAt) return false;

  for (const { familyId } of user.families) {
    const others = await db.familyMember.count({ where: { familyId, userId: { not: user.id } } });
    if (others > 0) continue; // Another caregiver still looks after these parents.

    const patients = await db.patient.findMany({ where: { familyId }, select: { id: true } });
    const patientIds = patients.map((p) => p.id);
    const addresses = await db.patientAddress.findMany({ where: { patientId: { in: patientIds } } });

    await db.$transaction([
      db.patient.updateMany({
        where: { familyId },
        data: { name: 'Deleted', phone: null, dateOfBirth: null, conditions: '', medications: '', careNotes: '', preferredLabId: null, isActive: false },
      }),
      ...addresses.map((a) => {
        const area = coarsen({ lat: a.latitude, lng: a.longitude });
        return db.patientAddress.update({
          where: { id: a.id },
          data: { line1: 'Deleted', line2: '', landmark: '', latitude: area.lat, longitude: area.lng },
        });
      }),
      db.elderAccess.deleteMany({ where: { patientId: { in: patientIds } } }),
      db.abhaAccount.deleteMany({ where: { patientId: { in: patientIds } } }),
      db.consentRecord.updateMany({
        where: { patientId: { in: patientIds }, withdrawnAt: null },
        data: { withdrawnAt: now, proxyName: null },
      }),
      db.family.update({ where: { id: familyId }, data: { name: 'Deleted family' } }),
    ]);
  }

  await db.$transaction([
    db.familyMember.deleteMany({ where: { userId: user.id } }),
    db.waitlistEntry.updateMany({
      where: { callerPhone: user.phone },
      data: { callerName: 'Deleted', callerPhone: '', patientName: 'Deleted', addressText: '', latitude: null, longitude: null },
    }),
    db.user.update({
      where: { id: user.id },
      data: {
        name: 'Deleted user',
        // Unique, and never a reachable number.
        phone: `deleted:${user.id}`,
        email: null,
        emailVerifiedAt: null,
        passwordHash: null,
        passwordChangedAt: null,
        erasedAt: now,
      },
    }),
  ]);
  await audit({ action: 'ACCOUNT_ERASED', entityType: 'User', entityId: user.id, actorRole: 'SYSTEM' });
  return true;
}

/** Erase every family account whose grace period has passed. For the retention job. */
export async function eraseDueAccounts(now = new Date()): Promise<number> {
  const due = await db.user.findMany({
    where: {
      role: 'CAREGIVER',
      isActive: false,
      erasedAt: null,
      deletionRequestedAt: { lt: new Date(now.getTime() - ERASE_AFTER_DAYS * 86_400_000) },
    },
    select: { id: true },
  });
  let erased = 0;
  for (const { id } of due) if (await eraseAccount(id, now)) erased++;
  return erased;
}
