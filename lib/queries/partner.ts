/**
 * What the partner terminal reads: the lab's orders by state, and what they
 * pay. Pages call these after their own role check; every query here is
 * scoped to one labId, never to a booking id alone.
 */

import 'server-only';
import { db } from '../db';
import { labPayout } from '../orders/lab-orders';
import { testsOfOrder } from '../orders/results';
import { istDayKey, istStartOfDay } from '../orders/ist';

const ITEMS = {
  include: { test: true, panel: { include: { items: { include: { test: true } } } } },
} as const;

/** Accepted and not yet reported: the lab's work in hand. */
export const IN_PROGRESS = ['SCHEDULED', 'EN_ROUTE', 'ARRIVED', 'COLLECTED', 'IN_TRANSIT', 'AT_LAB', 'PROCESSING'];
export const DONE = ['REPORTED', 'CLOSED'];

/** The signed-in person's laboratory, or null if they have not applied yet. */
export async function partnerMembership(userId: string) {
  return db.labMember.findFirst({
    where: { userId },
    include: {
      lab: {
        include: {
          accreditation: { include: { checks: true } },
          agreements: { orderBy: { version: 'desc' }, take: 1 },
        },
      },
    },
  });
}

export async function rateCardOf(labId: string): Promise<Map<string, number>> {
  const entries = await db.labRateCardEntry.findMany({ where: { labId }, select: { testId: true, costPaise: true } });
  return new Map(entries.map((e) => [e.testId, e.costPaise]));
}

/** Today's booked volume against the agreed ceiling (IST day). */
export async function todayVolume(labId: string, now = new Date()): Promise<number> {
  return db.booking.count({
    where: {
      labId,
      windowStart: { gte: istStartOfDay(now), lt: istStartOfDay(now, 1) },
      status: { notIn: ['AWAITING_PAYMENT', 'CANCELLED'] },
    },
  });
}

export async function loadTerminal(labId: string, now = new Date()) {
  const weekAgo = istStartOfDay(now, -6);
  const horizon = istStartOfDay(now, 8);
  const [pending, inProgress, completed, rateCard, volume] = await Promise.all([
    db.booking.findMany({
      where: { labId, status: 'SCHEDULED', labDecision: 'PENDING' },
      orderBy: { labDecisionDeadline: 'asc' },
      include: {
        patient: { select: { name: true, ageYears: true, sex: true } },
        address: { select: { city: true, pincode: true } },
        items: ITEMS,
      },
    }),
    db.booking.findMany({
      where: { labId, labDecision: 'ACCEPTED', status: { in: IN_PROGRESS }, windowStart: { lt: horizon } },
      orderBy: { windowStart: 'asc' },
      include: {
        patient: { select: { name: true, ageYears: true, sex: true } },
        items: ITEMS,
        technician: { select: { user: { select: { name: true } } } },
        specimens: {
          include: { coldChainLogs: { orderBy: { recordedAt: 'desc' }, take: 1 } },
          orderBy: { barcode: 'asc' },
        },
        // Metadata only: the encrypted file stays in the database.
        documents: { select: { fileName: true, sizeBytes: true, updatedAt: true } },
      },
    }),
    db.booking.findMany({
      where: { labId, status: { in: DONE }, reports: { some: { signedAt: { gte: weekAgo } } } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: {
        patient: { select: { name: true } },
        items: ITEMS,
        reports: { select: { status: true, signedAt: true, overallBand: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        documents: { select: { fileName: true, sizeBytes: true, updatedAt: true } },
      },
    }),
    rateCardOf(labId),
    todayVolume(labId, now),
  ]);

  const todayKey = istDayKey(now);
  const earnedToday = completed
    .filter((b) => b.reports[0]?.signedAt && istDayKey(b.reports[0].signedAt) === todayKey)
    .reduce((sum, b) => sum + labPayout(b.items, rateCard).paise, 0);

  return { pending, inProgress, completed, rateCard, volume, earnedToday };
}

/** The sidebar's live readings: cheap counts, on every console page. */
export async function sidebarReadings(labId: string, now = new Date()) {
  const [pending, inProgress, signedToday, rateCard] = await Promise.all([
    db.booking.count({ where: { labId, status: 'SCHEDULED', labDecision: 'PENDING' } }),
    db.booking.count({ where: { labId, labDecision: 'ACCEPTED', status: { in: IN_PROGRESS }, windowStart: { lt: istStartOfDay(now, 8) } } }),
    db.report.findMany({
      where: { labId, signedAt: { gte: istStartOfDay(now) } },
      select: { booking: { select: { items: ITEMS } } },
    }),
    rateCardOf(labId),
  ]);
  const earnedToday = signedToday.reduce((sum, r) => sum + labPayout(r.booking.items, rateCard).paise, 0);
  return { pending, inProgress, earnedToday };
}

/**
 * Earnings: what each signed report pays at the lab's rate card, by IST day,
 * with turnaround from sample intake to signature.
 */
export async function loadEarnings(labId: string, now = new Date(), days = 30) {
  const since = istStartOfDay(now, -(days - 1));
  const [reports, rateCard] = await Promise.all([
    db.report.findMany({
      where: { labId, signedAt: { gte: since } },
      orderBy: { signedAt: 'asc' },
      select: {
        signedAt: true,
        booking: {
          select: {
            reference: true,
            items: ITEMS,
            specimens: { select: { intakeAt: true } },
          },
        },
      },
    }),
    rateCardOf(labId),
  ]);

  const byDay = new Map<string, { paise: number; orders: number }>();
  for (let i = days - 1; i >= 0; i--) byDay.set(istDayKey(istStartOfDay(now, -i)), { paise: 0, orders: 0 });

  const byTest = new Map<string, { name: string; code: string; count: number; paise: number }>();
  const turnaroundHours: number[] = [];
  const unpriced = new Set<string>();

  for (const r of reports) {
    if (!r.signedAt) continue;
    const payout = labPayout(r.booking.items, rateCard);
    payout.unpriced.forEach((id) => unpriced.add(id));
    const day = byDay.get(istDayKey(r.signedAt));
    if (day) {
      day.paise += payout.paise;
      day.orders += 1;
    }
    for (const t of testsOfOrder(r.booking.items)) {
      const row = byTest.get(t.id) ?? { name: t.name, code: t.code, count: 0, paise: 0 };
      row.count += 1;
      row.paise += rateCard.get(t.id) ?? 0;
      byTest.set(t.id, row);
    }
    const intake = r.booking.specimens.map((s) => s.intakeAt).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0];
    if (intake) turnaroundHours.push((r.signedAt.getTime() - intake.getTime()) / 3_600_000);
  }

  const series = [...byDay.entries()].map(([key, v]) => ({ key, ...v }));
  const sum = (from: number) => series.slice(from).reduce((s, d) => s + d.paise, 0);
  return {
    series,
    today: sum(series.length - 1),
    week: sum(series.length - 7),
    month: sum(0),
    orders: reports.length,
    byTest: [...byTest.values()].sort((a, b) => b.paise - a.paise),
    avgTurnaroundHours: turnaroundHours.length ? turnaroundHours.reduce((a, b) => a + b, 0) / turnaroundHours.length : null,
    unpricedCount: unpriced.size,
  };
}
