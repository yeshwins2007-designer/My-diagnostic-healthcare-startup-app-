/**
 * The six numbers on one sheet, reviewed every Monday.
 *
 * Two of them are early warnings rather than results:
 *  - visits per technician per morning tells you whether the geography is
 *    still tight enough; if it drops, you have expanded too far.
 *  - referral share tells you whether the service is genuinely remarkable; if
 *    it stays low while paid acquisition works, you have a business that only
 *    grows when you spend, which is a business with a ceiling.
 *
 * Everything here is a pure function over counts, so the ops console and the
 * growth gates read the same numbers and cannot disagree.
 */

export interface MetricInputs {
  /** Visits whose window has passed. */
  completedVisits: number;
  /** Of those, arrived inside the promised window. */
  arrivedWithinWindow: number;

  collectedSpecimens: number;
  rejectedSpecimens: number;

  /** Subscriptions that reached their third month. */
  cohortReachingMonthThree: number;
  stillActiveAtMonthThree: number;

  /** Sum of visits across technician-mornings, and the number of mornings. */
  visitsAcrossMornings: number;
  technicianMornings: number;

  releasedReports: number;
  reportsWithFollowUpCallDone: number;

  newFamiliesThisPeriod: number;
  newFamiliesFromReferral: number;

  activeSubscribers: number;
  contributionMarginPaise: number;
}

export interface MondaySheet {
  onTimeWithinWindowPct: number;
  sampleRejectionPct: number;
  monthThreeRetentionPct: number;
  visitsPerTechnicianPerMorning: number;
  followUpCallCompletionPct: number;
  referralSharePct: number;
  activeSubscribers: number;
  contributionMarginPaise: number;
}

/** The blueprint's targets. A metric below target is not a nudge, it's a stop. */
export const TARGETS = {
  onTimeWithinWindowPct: 90,
  sampleRejectionPct: 2, // maximum, not minimum
  monthThreeRetentionPct: 85,
  visitsPerTechnicianPerMorningMin: 6,
  visitsPerTechnicianPerMorningIdeal: 8,
  followUpCallCompletionPct: 100,
  referralSharePct: 30,
} as const;

const pct = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : Math.round((numerator / denominator) * 1000) / 10;

export function computeMondaySheet(input: MetricInputs): MondaySheet {
  return {
    onTimeWithinWindowPct: pct(input.arrivedWithinWindow, input.completedVisits),
    sampleRejectionPct: pct(input.rejectedSpecimens, input.collectedSpecimens),
    monthThreeRetentionPct: pct(input.stillActiveAtMonthThree, input.cohortReachingMonthThree),
    visitsPerTechnicianPerMorning:
      input.technicianMornings === 0
        ? 0
        : Math.round((input.visitsAcrossMornings / input.technicianMornings) * 10) / 10,
    followUpCallCompletionPct: pct(input.reportsWithFollowUpCallDone, input.releasedReports),
    referralSharePct: pct(input.newFamiliesFromReferral, input.newFamiliesThisPeriod),
    activeSubscribers: input.activeSubscribers,
    contributionMarginPaise: input.contributionMarginPaise,
  };
}

export type MetricHealth = 'GOOD' | 'WATCH' | 'BAD' | 'NO_DATA';

export interface MetricVerdict {
  key: keyof MondaySheet;
  label: string;
  value: number;
  display: string;
  target: string;
  health: MetricHealth;
  /** What this number is actually telling you, in one sentence. */
  meaning: string;
}

export function judge(sheet: MondaySheet, hasData = true): MetricVerdict[] {
  const health = (ok: boolean, watch: boolean): MetricHealth =>
    !hasData ? 'NO_DATA' : ok ? 'GOOD' : watch ? 'WATCH' : 'BAD';

  return [
    {
      key: 'onTimeWithinWindowPct',
      label: 'On-time arrival within the promised window',
      value: sheet.onTimeWithinWindowPct,
      display: `${sheet.onTimeWithinWindowPct}%`,
      target: `≥ ${TARGETS.onTimeWithinWindowPct}%`,
      health: health(
        sheet.onTimeWithinWindowPct >= TARGETS.onTimeWithinWindowPct,
        sheet.onTimeWithinWindowPct >= TARGETS.onTimeWithinWindowPct - 5,
      ),
      meaning:
        'The promise you actually control. A call before a delay is forgivable; silence is not.',
    },
    {
      key: 'sampleRejectionPct',
      label: 'Sample rejection / recollection rate',
      value: sheet.sampleRejectionPct,
      display: `${sheet.sampleRejectionPct}%`,
      target: `< ${TARGETS.sampleRejectionPct}%`,
      health: health(
        sheet.sampleRejectionPct < TARGETS.sampleRejectionPct,
        sheet.sampleRejectionPct < TARGETS.sampleRejectionPct * 2,
      ),
      meaning: 'Every rejection is a free repeat visit and a founder phone call. No exceptions.',
    },
    {
      key: 'monthThreeRetentionPct',
      label: 'Month-3 subscription retention',
      value: sheet.monthThreeRetentionPct,
      display: `${sheet.monthThreeRetentionPct}%`,
      target: `≥ ${TARGETS.monthThreeRetentionPct}%`,
      health: health(
        sheet.monthThreeRetentionPct >= TARGETS.monthThreeRetentionPct,
        sheet.monthThreeRetentionPct >= TARGETS.monthThreeRetentionPct - 10,
      ),
      meaning: 'Retention is the whole story in a subscription model. It is the first thing an investor asks.',
    },
    {
      key: 'visitsPerTechnicianPerMorning',
      label: 'Visits per technician per morning',
      value: sheet.visitsPerTechnicianPerMorning,
      display: sheet.visitsPerTechnicianPerMorning.toFixed(1),
      target: `${TARGETS.visitsPerTechnicianPerMorningMin}–${TARGETS.visitsPerTechnicianPerMorningIdeal}`,
      health: health(
        sheet.visitsPerTechnicianPerMorning >= TARGETS.visitsPerTechnicianPerMorningMin,
        sheet.visitsPerTechnicianPerMorning >= TARGETS.visitsPerTechnicianPerMorningMin - 1.5,
      ),
      meaning:
        'The number that kills this business. At 3 visits instead of 8, labour cost per visit triples and margin goes negative. If it drops, you have expanded too far.',
    },
    {
      key: 'followUpCallCompletionPct',
      label: 'Reports followed by a 24-hour family call',
      value: sheet.followUpCallCompletionPct,
      display: `${sheet.followUpCallCompletionPct}%`,
      target: '100%',
      health: health(
        sheet.followUpCallCompletionPct >= 100,
        sheet.followUpCallCompletionPct >= 90,
      ),
      meaning: 'This single step drives most of your retention. There is no acceptable number below 100%.',
    },
    {
      key: 'referralSharePct',
      label: 'New families arriving via referral',
      value: sheet.referralSharePct,
      display: `${sheet.referralSharePct}%`,
      target: `≥ ${TARGETS.referralSharePct}%`,
      health: health(
        sheet.referralSharePct >= TARGETS.referralSharePct,
        sheet.referralSharePct >= TARGETS.referralSharePct - 10,
      ),
      meaning:
        'Whether the service is genuinely remarkable. If this stays near zero while paid acquisition works, you have a business with a ceiling.',
    },
  ];
}

/**
 * Contribution margin per subscriber, worked the way the blueprint works it.
 * Every figure is a real ledger total, not an assumption — the structure
 * matters more than the numbers, but the numbers must be actual.
 */
export interface ContributionInputs {
  subscriptionRevenuePaise: number;
  labCostPaise: number;
  technicianCostPaise: number;
  consumablesPaise: number;
  transportPaise: number;
  supportPaise: number;
  activeSubscribers: number;
}

export interface ContributionResult {
  totalPaise: number;
  perSubscriberPaise: number;
  marginPct: number;
  /** 12-month gross contribution per subscriber, the CAC ceiling input. */
  twelveMonthPerSubscriberPaise: number;
  /** Maximum acceptable CAC: the blueprint caps it well under annual value. */
  maxAcceptableCacPaise: number;
  cacPaybackMonths: number;
}

export function computeContribution(input: ContributionInputs): ContributionResult {
  const costs =
    input.labCostPaise +
    input.technicianCostPaise +
    input.consumablesPaise +
    input.transportPaise +
    input.supportPaise;

  const totalPaise = input.subscriptionRevenuePaise - costs;
  const perSubscriberPaise =
    input.activeSubscribers === 0 ? 0 : Math.round(totalPaise / input.activeSubscribers);
  const marginPct =
    input.subscriptionRevenuePaise === 0
      ? 0
      : Math.round((totalPaise / input.subscriptionRevenuePaise) * 1000) / 10;

  const twelveMonth = perSubscriberPaise * 12;
  // Cap CAC at roughly a quarter of twelve-month contribution: ~3 month payback.
  const maxAcceptableCacPaise = Math.max(0, Math.round(twelveMonth * 0.27));

  return {
    totalPaise,
    perSubscriberPaise,
    marginPct,
    twelveMonthPerSubscriberPaise: twelveMonth,
    maxAcceptableCacPaise,
    cacPaybackMonths:
      perSubscriberPaise <= 0
        ? Infinity
        : Math.round((maxAcceptableCacPaise / perSubscriberPaise) * 10) / 10,
  };
}
