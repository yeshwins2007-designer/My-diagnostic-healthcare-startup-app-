/**
 * Orders, as a partner lab sees them: accept, reject, and what each is worth.
 *
 * The marketplace rule, and why it is not Swiggy's: a restaurant that
 * rejects an order costs a family a dinner; a lab that rejects one can cost an
 * elderly parent a fasting morning. So a lab may say no, but only:
 *
 *   - within a short window after the order is paid (DECISION_WINDOW_MINUTES),
 *   - and never within REJECT_CUTOFF_HOURS of the visit, when there is no
 *     longer time to re-route safely.
 *
 * After the window the order counts as accepted: the service agreement
 * already commits the lab's daily capacity, and the routing gate never sends
 * more than that ceiling. A rejection re-routes the order through the same
 * legal gate as a booking (selectLab: active, accredited for every test's
 * discipline, under capacity, not paused, nearest first). The family's price
 * is locked: it was quoted and paid, and a re-route is our problem, not
 * theirs. If no lab can take it, the order goes to ops as an incident.
 */

import 'server-only';
import { db } from '../db';
import { audit } from '../compliance/audit';
import { haversineKm } from '../geo';
import { selectLab, type RoutableLab, type RoutableTest } from '../sop/labRouting';
import { testsOfOrder } from './results';

export const DECISION_WINDOW_MINUTES = 30;
export const REJECT_CUTOFF_HOURS = 3;

export const REJECT_REASONS = [
  'At capacity for that day',
  'A test in this order is unavailable (analyser or reagent)',
  'Cannot meet the turnaround for this order',
  'Other',
] as const;

/**
 * When a lab's chance to reject a newly paid order closes, or null when the
 * visit is already too close for a rejection to be safe.
 */
export function decisionDeadline(paidAt: Date, windowStart: Date): Date | null {
  const byWindow = paidAt.getTime() + DECISION_WINDOW_MINUTES * 60_000;
  const byVisit = windowStart.getTime() - REJECT_CUTOFF_HOURS * 3_600_000;
  const deadline = Math.min(byWindow, byVisit);
  return deadline > paidAt.getTime() ? new Date(deadline) : null;
}

/**
 * The fields to set when an order becomes paid (status SCHEDULED): open the
 * lab's decision, or accept it at once when there is no safe window.
 */
export function openLabDecision(windowStart: Date, now = new Date()) {
  const deadline = decisionDeadline(now, windowStart);
  return deadline
    ? { labDecision: 'PENDING', labDecisionDeadline: deadline, labDecisionAt: null, labDecisionReason: '' }
    : { labDecision: 'ACCEPTED', labDecisionDeadline: null, labDecisionAt: now, labDecisionReason: 'Accepted automatically: the visit is too close to re-route.' };
}

/** Orders whose window has closed count as accepted. Returns how many. */
export async function autoAcceptExpired(labId?: string, now = new Date()): Promise<number> {
  const done = await db.booking.updateMany({
    where: { labDecision: 'PENDING', labDecisionDeadline: { lt: now }, ...(labId ? { labId } : {}) },
    data: { labDecision: 'ACCEPTED', labDecisionAt: now, labDecisionReason: 'Accepted automatically when the decision window closed.' },
  });
  return done.count;
}

type DecisionResult = { ok: true; message: string } | { ok: false; message: string };

async function decidable(bookingId: string, labId: string, now: Date) {
  const booking = await db.booking.findFirst({
    where: { id: bookingId, labId },
    include: {
      address: true,
      items: { include: { test: true, panel: { include: { items: { include: { test: true } } } } } },
    },
  });
  if (!booking) return { error: 'That order is not routed to your laboratory.' } as const;
  if (booking.status !== 'SCHEDULED' || booking.labDecision !== 'PENDING') {
    return { error: 'This order has already been decided.' } as const;
  }
  if (!booking.labDecisionDeadline || booking.labDecisionDeadline <= now) {
    return { error: 'The window to decide has closed, so this order is accepted.' } as const;
  }
  return { booking } as const;
}

export async function acceptOrder(input: { bookingId: string; labId: string; userId: string; now?: Date }): Promise<DecisionResult> {
  const now = input.now ?? new Date();
  const found = await decidable(input.bookingId, input.labId, now);
  if ('error' in found) return { ok: false, message: found.error! };
  // Conditional: two staff tapping at once cannot both decide.
  const done = await db.booking.updateMany({
    where: { id: input.bookingId, labId: input.labId, labDecision: 'PENDING' },
    data: { labDecision: 'ACCEPTED', labDecisionAt: now, labDecisionReason: '' },
  });
  if (done.count === 0) return { ok: false, message: 'This order has already been decided.' };
  await audit({
    action: 'LAB_ORDER_ACCEPTED',
    entityType: 'Booking',
    entityId: input.bookingId,
    actorUserId: input.userId,
    actorRole: 'LAB',
  });
  return { ok: true, message: `Accepted ${found.booking.reference}.` };
}

export async function rejectOrder(input: {
  bookingId: string;
  labId: string;
  userId: string;
  reason: string;
  now?: Date;
}): Promise<DecisionResult & { reroutedToLabId?: string | null }> {
  const now = input.now ?? new Date();
  const reason = input.reason.trim();
  if (reason.length < 3) return { ok: false, message: 'Choose a reason for rejecting the order.' };

  const found = await decidable(input.bookingId, input.labId, now);
  if ('error' in found) return { ok: false, message: found.error! };
  const booking = found.booking;

  // Claim the decision first, so a concurrent accept cannot also succeed.
  const claimed = await db.booking.updateMany({
    where: { id: booking.id, labId: input.labId, labDecision: 'PENDING' },
    data: { labDecision: 'REJECTING' },
  });
  if (claimed.count === 0) return { ok: false, message: 'This order has already been decided.' };

  try {
    return await rerouteAfterRejection(booking, input, reason, now);
  } catch (error) {
    // Give the decision back rather than leave the order half-rejected.
    await db.booking.updateMany({ where: { id: booking.id, labDecision: 'REJECTING' }, data: { labDecision: 'PENDING' } });
    throw error;
  }
}

type DecidableBooking = Extract<Awaited<ReturnType<typeof decidable>>, { booking: unknown }>['booking'];

async function rerouteAfterRejection(
  booking: DecidableBooking,
  input: { bookingId: string; labId: string; userId: string },
  reason: string,
  now: Date,
): Promise<DecisionResult & { reroutedToLabId?: string | null }> {
  const rejected = [...new Set([...booking.rejectedLabIds.split(',').filter(Boolean), input.labId])];
  const tests = testsOfOrder(booking.items);
  const routingTests: RoutableTest[] = tests.map((t) => ({ code: t.code, name: t.name, discipline: t.discipline }));

  const dayStart = new Date(booking.windowStart);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const labs = await db.lab.findMany({
    where: { status: 'ACTIVE', id: { notIn: rejected } },
    include: { accreditation: true, rateCard: true },
  });
  const candidates: (RoutableLab & { distanceKm: number })[] = [];
  for (const lab of labs) {
    // A lab is a candidate only if its rate card offers every test, unpaused.
    const offered = new Map(lab.rateCard.map((r) => [r.testId, r]));
    if (!tests.every((t) => offered.has(t.id) && !offered.get(t.id)!.isPaused)) continue;
    const todayVolume = await db.booking.count({
      where: { labId: lab.id, windowStart: { gte: dayStart, lt: dayEnd }, status: { notIn: ['AWAITING_PAYMENT', 'CANCELLED'] } },
    });
    candidates.push({
      id: lab.id,
      name: lab.name,
      status: lab.status,
      capacityCeiling: lab.capacityCeiling,
      todayVolume,
      accreditation: lab.accreditation
        ? { certificateNumber: lab.accreditation.certificateNumber, scope: lab.accreditation.scope, validUntil: lab.accreditation.validUntil }
        : null,
      distanceKm: haversineKm(
        { lat: booking.address.latitude, lng: booking.address.longitude },
        { lat: lab.latitude, lng: lab.longitude },
      ),
    });
  }
  const choice = selectLab(candidates, routingTests, now);

  await audit({
    action: 'LAB_ORDER_REJECTED',
    entityType: 'Booking',
    entityId: booking.id,
    actorUserId: input.userId,
    actorRole: 'LAB',
    detail: { reason, labId: input.labId },
  });

  if (choice.lab) {
    await db.booking.update({
      where: { id: booking.id },
      data: {
        labId: choice.lab.id,
        rejectedLabIds: rejected.join(','),
        ...openLabDecision(booking.windowStart, now),
      },
    });
    await audit({
      action: 'LAB_ORDER_REROUTED',
      entityType: 'Booking',
      entityId: booking.id,
      actorUserId: input.userId,
      actorRole: 'LAB',
      detail: { from: input.labId, to: choice.lab.id, priceLocked: booking.totalPaise },
    });
    return { ok: true, message: `Rejected ${booking.reference}. It has gone to another partner lab; the family is not affected.`, reroutedToLabId: choice.lab.id };
  }

  // Nobody can take it: hand it to a person, with the reasons.
  await db.booking.update({
    where: { id: booking.id },
    data: {
      labId: null,
      labDecision: 'UNROUTED',
      labDecisionAt: now,
      labDecisionReason: reason,
      rejectedLabIds: rejected.join(','),
    },
  });
  await db.incident.create({
    data: {
      bookingId: booking.id,
      tier: 'TIER_2_MAJOR',
      kind: 'NO_LAB_AVAILABLE',
      summary: `Order ${booking.reference} was rejected (“${reason}”) and no other partner lab can take it. Visit on ${booking.windowStart.toISOString()}. ${choice.rejections.map((r) => r.reason).join(' ')}`.slice(0, 1000),
    },
  });
  return { ok: true, message: `Rejected ${booking.reference}. No other lab could take it, so our operations team has it now.`, reroutedToLabId: null };
}

/**
 * What an order pays the lab: its rate-card cost for every test in it (a
 * panel pays for each of its tests). Tests missing from the rate card pay 0
 * and are listed, so a gap in the card is visible rather than silently cheap.
 */
export function labPayout(
  items: { panel?: { items: { test: { id: string } }[] } | null; test?: { id: string } | null }[],
  rateCard: Map<string, number>,
): { paise: number; unpriced: string[] } {
  const tests = testsOfOrder(items);
  let paise = 0;
  const unpriced: string[] = [];
  for (const t of tests) {
    const cost = rateCard.get(t.id);
    if (cost === undefined) unpriced.push(t.id);
    else paise += cost;
  }
  return { paise, unpriced };
}
