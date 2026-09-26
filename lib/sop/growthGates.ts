/**
 * Growth gates.
 *
 * The blueprint is blunt about the mistake that would cost a year: building
 * the three-sided marketplace before there are 50 paying families. Software is
 * the reward for proven demand, not the route to it.
 *
 * So the marketplace features exist in this codebase but are *locked*, and the
 * lock is not a config flag someone flips on a hopeful Tuesday — it reads the
 * live Monday numbers and refuses until they are actually met. When it
 * refuses, it says exactly which criterion is short and by how much.
 *
 * "Do not open zone two until zone one hits every one of these: 60+ active
 * subscriptions, under 2% sample rejection, 90%+ on-time arrival for three
 * consecutive months, and positive contribution margin."
 */

import type { GrowthGateKey } from '../enums';
import type { MondaySheet } from './metrics';
import type { Criterion } from './types';

export interface GateInputs {
  /** Current week's numbers. */
  current: MondaySheet;
  /**
   * On-time percentage for each of the last N weeks, newest first. The
   * three-consecutive-months rule needs history, not a single good week.
   */
  onTimeHistoryWeekly: number[];
  /** Number of technicians currently working the zone. */
  technicianCount: number;
  /** Whether zone one has a written, signed lab agreement on file. */
  hasSignedLabAgreement: boolean;
}

export interface GateResult {
  key: GrowthGateKey;
  label: string;
  passed: boolean;
  criteria: Criterion[];
  /** What to do next — never just "denied". */
  guidance: string;
}

const WEEKS_IN_THREE_MONTHS = 13;

function consecutiveWeeksAbove(history: number[], threshold: number): number {
  let count = 0;
  for (const week of history) {
    if (week >= threshold) count += 1;
    else break;
  }
  return count;
}

export function evaluateZoneTwoUnlock(input: GateInputs): GateResult {
  const s = input.current;
  const streak = consecutiveWeeksAbove(input.onTimeHistoryWeekly, 90);

  const criteria: Criterion[] = [
    {
      key: 'activeSubscribers',
      label: 'Active subscriptions in zone one',
      required: '≥ 60',
      actual: String(s.activeSubscribers),
      met: s.activeSubscribers >= 60,
    },
    {
      key: 'sampleRejection',
      label: 'Sample rejection rate',
      required: '< 2%',
      actual: `${s.sampleRejectionPct}%`,
      met: s.sampleRejectionPct < 2,
    },
    {
      key: 'onTimeStreak',
      label: 'On-time arrival ≥ 90% for three consecutive months',
      required: `${WEEKS_IN_THREE_MONTHS} consecutive weeks`,
      actual: `${streak} consecutive week${streak === 1 ? '' : 's'}`,
      met: streak >= WEEKS_IN_THREE_MONTHS,
    },
    {
      key: 'contributionMargin',
      label: 'Contribution margin',
      required: 'positive',
      actual: s.contributionMarginPaise > 0 ? 'positive' : 'not yet positive',
      met: s.contributionMarginPaise > 0,
    },
  ];

  const passed = criteria.every((c) => c.met);

  return {
    key: 'ZONE_TWO_UNLOCK',
    label: 'Open a second zone',
    passed,
    criteria,
    guidance: passed
      ? 'Zone one runs without you. Repeat the identical playbook in an adjacent zone — same radius logic, one anchor lab per zone.'
      : 'Geography compounds only when the previous zone runs without you in it. Keep out-of-zone families on the waitlist; that list is the evidence for opening zone two, not a reason to break the radius today.',
  };
}

export function evaluateMarketplaceUnlock(input: GateInputs): GateResult {
  const s = input.current;

  const criteria: Criterion[] = [
    {
      key: 'payingFamilies',
      label: 'Paying families',
      required: '≥ 50',
      actual: String(s.activeSubscribers),
      met: s.activeSubscribers >= 50,
    },
    {
      key: 'retention',
      label: 'Month-3 retention',
      required: '≥ 85%',
      actual: `${s.monthThreeRetentionPct}%`,
      met: s.monthThreeRetentionPct >= 85,
    },
    {
      key: 'referralShare',
      label: 'New families arriving by referral',
      required: '≥ 30%',
      actual: `${s.referralSharePct}%`,
      met: s.referralSharePct >= 30,
    },
    {
      key: 'signedAgreement',
      label: 'Signed lab service agreement on file',
      required: 'yes',
      actual: input.hasSignedLabAgreement ? 'yes' : 'no',
      met: input.hasSignedLabAgreement,
    },
    {
      key: 'contributionMargin',
      label: 'Contribution margin',
      required: 'positive',
      actual: s.contributionMarginPaise > 0 ? 'positive' : 'not yet positive',
      met: s.contributionMarginPaise > 0,
    },
  ];

  const passed = criteria.every((c) => c.met);

  return {
    key: 'MARKETPLACE_UNLOCK',
    label: 'Open self-serve lab onboarding and multi-lab routing',
    passed,
    criteria,
    guidance: passed
      ? 'Demand is proven and the playbook is written. Open lab applications — every one still passes the seven-point NABL verification before it can receive a single sample.'
      : 'Until this passes, run on the ops console, WhatsApp and the phone. If referral share is near zero, the service is not remarkable enough yet — fix the experience before spending on acquisition or on more software.',
  };
}

export function evaluateSecondTechnician(input: GateInputs): GateResult {
  const s = input.current;

  const criteria: Criterion[] = [
    {
      key: 'density',
      label: 'Existing technician consistently doing 6+ morning visits',
      required: '≥ 6.0',
      actual: s.visitsPerTechnicianPerMorning.toFixed(1),
      met: s.visitsPerTechnicianPerMorning >= 6,
    },
    {
      key: 'onlyOne',
      label: 'Still running a single technician',
      required: '1',
      actual: String(input.technicianCount),
      met: input.technicianCount <= 1,
    },
  ];

  const passed = criteria.every((c) => c.met);

  return {
    key: 'SECOND_TECHNICIAN',
    label: 'Hire a second technician',
    passed,
    criteria,
    guidance: passed
      ? 'Density supports a second route. Cross-train immediately — key-person dependency on one technician is a major risk.'
      : input.technicianCount > 1
        ? 'You already have more than one technician. Watch visits per morning: adding people before density exists is what makes margin negative.'
        : 'One technician is enough at this stage. Two is a mistake until the first is consistently doing six or more morning visits.',
  };
}

export function evaluateAllGates(input: GateInputs): GateResult[] {
  return [
    evaluateSecondTechnician(input),
    evaluateZoneTwoUnlock(input),
    evaluateMarketplaceUnlock(input),
  ];
}

export function isGateOpen(key: GrowthGateKey, input: GateInputs): boolean {
  switch (key) {
    case 'ZONE_TWO_UNLOCK':
      return evaluateZoneTwoUnlock(input).passed;
    case 'MARKETPLACE_UNLOCK':
      return evaluateMarketplaceUnlock(input).passed;
    case 'SECOND_TECHNICIAN':
      return evaluateSecondTechnician(input).passed;
  }
}
