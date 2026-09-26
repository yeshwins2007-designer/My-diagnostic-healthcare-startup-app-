import 'server-only';
import { db } from '../db';
import {
  computeContribution,
  computeMondaySheet,
  evaluateAllGates,
  type GateInputs,
  type MondaySheet,
} from '../sop';
import { classifyArrival, countsAsOnTime } from '../sop/visitWindow';

/**
 * The Monday numbers, computed from live rows rather than from a stored
 * summary. The ops console and the growth gates therefore read the same
 * figures and cannot drift apart — which matters, because the gates use them
 * to refuse expansion.
 */
export async function buildMondaySheet(zoneId?: string): Promise<MondaySheet> {
  const now = new Date();
  const zoneFilter = zoneId ? { zoneId } : {};

  const [
    completedVisits,
    specimens,
    subscriptions,
    releasedReports,
    followUpsDone,
    families,
    routes,
    ledger,
  ] = await Promise.all([
    db.booking.findMany({
      where: { ...zoneFilter, windowEnd: { lt: now }, status: { notIn: ['CANCELLED'] } },
      select: { windowStart: true, windowEnd: true, arrivedAt: true },
    }),
    db.specimen.findMany({ select: { status: true } }),
    db.subscription.findMany({
      select: { status: true, startedAt: true, cancelledAt: true },
    }),
    db.report.count({ where: { status: 'RELEASED' } }),
    db.followUpCall.count({ where: { status: 'COMPLETED' } }),
    db.family.count(),
    db.route.findMany({
      where: { status: { in: ['STARTED', 'COMPLETED'] } },
      select: { id: true, _count: { select: { bookings: true } } },
    }),
    db.ledgerEntry.groupBy({ by: ['account'], _sum: { amountPaise: true } }),
  ]);

  const arrivedWithinWindow = completedVisits.filter((b) =>
    countsAsOnTime(classifyArrival(b)),
  ).length;

  const rejected = specimens.filter((s) => s.status === 'REJECTED').length;

  // A subscription counts towards the month-3 cohort once it is old enough to
  // have had the chance to churn.
  const threeMonthsMs = 90 * 86_400_000;
  const cohort = subscriptions.filter(
    (s) => s.startedAt && now.getTime() - s.startedAt.getTime() >= threeMonthsMs,
  );
  const stillActive = cohort.filter((s) => s.status === 'ACTIVE').length;

  const visitsAcrossMornings = routes.reduce((sum, r) => sum + r._count.bookings, 0);

  const byAccount = Object.fromEntries(
    ledger.map((row) => [row.account, row._sum.amountPaise ?? 0]),
  );

  const activeSubscribers = subscriptions.filter((s) => s.status === 'ACTIVE').length;

  const contribution = computeContribution({
    subscriptionRevenuePaise: byAccount.REVENUE ?? 0,
    labCostPaise: Math.abs(byAccount.LAB_COST ?? 0),
    technicianCostPaise: Math.abs(byAccount.TECHNICIAN_COST ?? 0),
    consumablesPaise: Math.abs(byAccount.CONSUMABLES ?? 0),
    transportPaise: Math.abs(byAccount.TRANSPORT ?? 0),
    supportPaise: Math.abs(byAccount.SUPPORT ?? 0),
    activeSubscribers,
  });

  return computeMondaySheet({
    completedVisits: completedVisits.length,
    arrivedWithinWindow,
    collectedSpecimens: specimens.length,
    rejectedSpecimens: rejected,
    cohortReachingMonthThree: cohort.length,
    stillActiveAtMonthThree: stillActive,
    visitsAcrossMornings,
    technicianMornings: routes.length,
    releasedReports,
    reportsWithFollowUpCallDone: followUpsDone,
    newFamiliesThisPeriod: families,
    // Referral attribution is not modelled yet; this reads zero until it is,
    // which is more honest than inventing a number the gates then trust.
    newFamiliesFromReferral: 0,
    activeSubscribers,
    contributionMarginPaise: contribution.totalPaise,
  });
}

/** Everything the growth gates need, in one round trip. */
export async function buildGateInputs(zoneId?: string): Promise<GateInputs> {
  const [current, history, technicianCount, signedAgreement] = await Promise.all([
    buildMondaySheet(zoneId),
    db.metricSnapshot.findMany({
      where: zoneId ? { zoneId } : {},
      orderBy: { weekStart: 'desc' },
      take: 26,
      select: { onTimeWithinWindowPct: true },
    }),
    db.technician.count({ where: { isActive: true, ...(zoneId ? { zoneId } : {}) } }),
    db.labAgreement.count({ where: { status: 'SIGNED' } }),
  ]);

  return {
    current,
    onTimeHistoryWeekly: history.map((h) => h.onTimeWithinWindowPct),
    technicianCount,
    hasSignedLabAgreement: signedAgreement > 0,
  };
}

export async function evaluateGates(zoneId?: string) {
  const inputs = await buildGateInputs(zoneId);
  return { inputs, gates: evaluateAllGates(inputs) };
}

/**
 * The historic trend behind each metric, for the small sparkline next to the
 * number. A single week in isolation tells an operator nothing.
 */
export async function metricHistory(zoneId?: string, weeks = 12) {
  return db.metricSnapshot.findMany({
    where: zoneId ? { zoneId } : {},
    orderBy: { weekStart: 'asc' },
    take: weeks,
  });
}
