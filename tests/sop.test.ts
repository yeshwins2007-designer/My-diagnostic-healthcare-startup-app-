/**
 * The SOP engine.
 *
 * Each rule here encodes one line of the operating blueprint. These tests
 * exist to stop a rule quietly degrading into advice — the difference between
 * "we warn about out-of-zone bookings" and "we refuse them" is the difference
 * between a business with positive contribution margin and one without.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateRadius,
  validateOverrideReason,
  type ZoneBoundary,
} from '@/lib/sop/radiusGuard';
import {
  readClock,
  budgetForSpecimens,
  evaluateIntake,
  DEFAULT_CLOCK_MINUTES,
} from '@/lib/sop/sampleClock';
import {
  classifyReading,
  evaluateHandoffReadiness,
  isBreach,
  findLoggingGaps,
} from '@/lib/sop/coldChain';
import {
  evaluateContinuity,
  continuityRate,
  substitutionMessage,
} from '@/lib/sop/continuityRule';
import {
  evaluateRouting,
  selectLab,
  validateCertificateNumber,
  parseScope,
  type RoutableLab,
} from '@/lib/sop/labRouting';
import { evaluateAlertClosure, escalationLevel, buildCriticalCallScript } from '@/lib/sop/criticalValue';
import { evaluateCompletion, urgency, dueBy } from '@/lib/sop/followUp';
import { classifyArrival, countsAsOnTime, projectArrival, morningSlots } from '@/lib/sop/visitWindow';
import { computeMondaySheet, computeContribution, judge } from '@/lib/sop/metrics';
import { evaluateZoneTwoUnlock, evaluateMarketplaceUnlock, evaluateSecondTechnician } from '@/lib/sop/growthGates';
import { isRefusal } from '@/lib/sop/types';
import { formatINR, numberToWordsIN, annualFromMonthly, applyDiscount, paise } from '@/lib/money';
import { haversineKm, pointInPolygon, encodePolyline, decodePolyline } from '@/lib/geo';
import { ageBandFor } from '@/lib/enums';

// Jayanagar 4th Block — the seeded anchor.
const ANCHOR = { lat: 12.925, lng: 77.5838 };
const ZONE: ZoneBoundary = {
  id: 'zone-1',
  name: 'Jayanagar 4th Block',
  centerLat: ANCHOR.lat,
  centerLng: ANCHOR.lng,
  radiusKm: 5,
  isActive: true,
};

// --- radius ------------------------------------------------------------------

describe('radiusGuard', () => {
  it('allows an address well inside the zone', () => {
    const result = evaluateRadius({ lat: 12.9271, lng: 77.5892 }, [ZONE]);
    expect(result.decision.outcome).toBe('ALLOW');
    expect(result.zone?.id).toBe('zone-1');
  });

  it('REFUSES an out-of-zone address rather than warning about it', () => {
    // Whitefield — about 17 km away. The whole business case rests on this
    // being a refusal, not a nudge.
    const result = evaluateRadius({ lat: 12.9698, lng: 77.75 }, [ZONE]);
    expect(result.decision.outcome).toBe('REFUSE');
    expect(result.zone).toBeNull();
    expect(result.distanceKm).toBeGreaterThan(15);
    if (isRefusal(result.decision)) {
      expect(result.decision.remedy).toMatch(/waitlist/i);
    }
  });

  it('warns near the edge without refusing', () => {
    // ~4.6 km north: inside 5 km, past the 90% warning threshold.
    const result = evaluateRadius({ lat: 12.9664, lng: 77.5838 }, [ZONE]);
    expect(result.decision.outcome).toBe('WARN');
  });

  it('refuses everything when no zone is open', () => {
    expect(evaluateRadius(ANCHOR, []).decision.outcome).toBe('REFUSE');
    expect(evaluateRadius(ANCHOR, [{ ...ZONE, isActive: false }]).decision.outcome).toBe('REFUSE');
  });

  it('lets a hand-drawn polygon override the circle', () => {
    // A point 8 km out — outside the radius, but inside a drawn boundary.
    const far = { lat: 12.995, lng: 77.5838 };
    const polygon = [
      { lat: 12.90, lng: 77.55 },
      { lat: 13.02, lng: 77.55 },
      { lat: 13.02, lng: 77.62 },
      { lat: 12.90, lng: 77.62 },
    ];
    expect(evaluateRadius(far, [ZONE]).decision.outcome).toBe('REFUSE');
    expect(evaluateRadius(far, [{ ...ZONE, polygon }]).decision.outcome).toBe('ALLOW');
  });

  it('demands a real reason for an override', () => {
    expect(validateOverrideReason('ok').outcome).toBe('REFUSE');
    expect(validateOverrideReason('   ').outcome).toBe('REFUSE');
    expect(
      validateOverrideReason(
        'Existing subscriber since March who moved one street outside the line.',
      ).outcome,
    ).toBe('ALLOW');
  });
});

// --- sample clock ------------------------------------------------------------

describe('sampleClock', () => {
  const start = new Date('2026-09-07T07:00:00Z');
  const at = (mins: number) => new Date(start.getTime() + mins * 60_000);

  it('reports NOT_STARTED before collection', () => {
    expect(readClock({ clockStartsAt: null, intakeAt: null }).state).toBe('NOT_STARTED');
  });

  it('is green early, amber at 75%, breached past the budget', () => {
    expect(readClock({ clockStartsAt: start, intakeAt: null, now: at(30) }).state).toBe('GREEN');
    expect(readClock({ clockStartsAt: start, intakeAt: null, now: at(95) }).state).toBe('AMBER');
    expect(readClock({ clockStartsAt: start, intakeAt: null, now: at(150) }).state).toBe('BREACHED');
  });

  it('closes when intake is recorded, and remembers if it was late', () => {
    const onTime = readClock({ clockStartsAt: start, intakeAt: at(63) });
    expect(onTime.state).toBe('CLOSED');
    expect(onTime.elapsedMinutes).toBe(63);
    expect(onTime.label).not.toMatch(/late/i);

    const late = readClock({ clockStartsAt: start, intakeAt: at(140) });
    expect(late.state).toBe('CLOSED');
    expect(late.label).toMatch(/late/i);
  });

  it('never lets the progress fraction exceed 1', () => {
    expect(readClock({ clockStartsAt: start, intakeAt: null, now: at(600) }).fraction).toBe(1);
  });

  it('takes the TIGHTEST stability window in the box, not the average', () => {
    // Mixing a 2-hour-stable tube with a 6-hour one does not give you six hours.
    expect(budgetForSpecimens([6, 2, 8])).toBe(120);
    expect(budgetForSpecimens([1, 6])).toBe(60);
    expect(budgetForSpecimens([])).toBe(DEFAULT_CLOCK_MINUTES);
  });

  it('refuses a breached intake with a remedy rather than blocking the log', () => {
    const breached = readClock({ clockStartsAt: start, intakeAt: null, now: at(150) });
    const decision = evaluateIntake(breached);
    expect(decision.outcome).toBe('REFUSE');
    if (isRefusal(decision)) {
      expect(decision.remedy).toMatch(/free recollection/i);
    }
  });
});

// --- cold chain --------------------------------------------------------------

describe('coldChain', () => {
  const now = new Date('2026-09-07T08:00:00Z');
  const ago = (mins: number) => new Date(now.getTime() - mins * 60_000);

  it('knows the acceptable band', () => {
    expect(isBreach(4.2)).toBe(false);
    expect(isBreach(1.9)).toBe(true);
    expect(isBreach(8.1)).toBe(true);
    expect(classifyReading(4).outcome).toBe('ALLOW');
    expect(classifyReading(7.5).outcome).toBe('WARN');
    expect(classifyReading(12).outcome).toBe('REFUSE');
  });

  it('BLOCKS the handoff when no temperature was ever logged', () => {
    const decision = evaluateHandoffReadiness({ readings: [], collectedAt: ago(30), now });
    expect(decision.outcome).toBe('REFUSE');
    if (isRefusal(decision)) expect(decision.reason).toMatch(/no temperature/i);
  });

  it('BLOCKS the handoff when the box is not sealed', () => {
    const decision = evaluateHandoffReadiness({
      readings: [{ temperatureC: 4.5, recordedAt: ago(3), boxSealed: false }],
      collectedAt: ago(30),
      now,
    });
    expect(decision.outcome).toBe('REFUSE');
    if (isRefusal(decision)) expect(decision.reason).toMatch(/not recorded as sealed/i);
  });

  it('BLOCKS the handoff when any reading breached, even if the latest is fine', () => {
    const decision = evaluateHandoffReadiness({
      readings: [
        { temperatureC: 14.2, recordedAt: ago(20), boxSealed: true },
        { temperatureC: 4.1, recordedAt: ago(2), boxSealed: true },
      ],
      collectedAt: ago(30),
      now,
    });
    expect(decision.outcome).toBe('REFUSE');
  });

  it('allows a clean, sealed, recently-logged box', () => {
    expect(
      evaluateHandoffReadiness({
        readings: [{ temperatureC: 4.4, recordedAt: ago(2), boxSealed: true }],
        collectedAt: ago(30),
        now,
      }).outcome,
    ).toBe('ALLOW');
  });

  it('warns when the last reading is stale', () => {
    expect(
      evaluateHandoffReadiness({
        readings: [{ temperatureC: 4.4, recordedAt: ago(45), boxSealed: true }],
        collectedAt: ago(60),
        now,
      }).outcome,
    ).toBe('WARN');
  });

  it('finds gaps in the logging record', () => {
    const gaps = findLoggingGaps([
      { temperatureC: 4, recordedAt: ago(60), boxSealed: true },
      { temperatureC: 4, recordedAt: ago(5), boxSealed: true },
    ]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].gapMinutes).toBe(55);
  });
});

// --- continuity --------------------------------------------------------------

describe('continuityRule', () => {
  it('allows anyone on a first visit', () => {
    expect(
      evaluateContinuity({
        assignedTechnicianId: null,
        proposedTechnicianId: 'tech-b',
        recentVisits: [],
      }).outcome,
    ).toBe('ALLOW');
  });

  it('allows the assigned technician', () => {
    expect(
      evaluateContinuity({
        assignedTechnicianId: 'tech-a',
        proposedTechnicianId: 'tech-a',
        recentVisits: [],
      }).outcome,
    ).toBe('ALLOW');
  });

  it('REFUSES a substitution with no reason', () => {
    const decision = evaluateContinuity({
      assignedTechnicianId: 'tech-a',
      proposedTechnicianId: 'tech-b',
      recentVisits: [],
    });
    expect(decision.outcome).toBe('REFUSE');
    if (isRefusal(decision)) expect(decision.remedy).toMatch(/personal message/i);
  });

  it('allows a substitution once a reason is given', () => {
    expect(
      evaluateContinuity({
        assignedTechnicianId: 'tech-a',
        proposedTechnicianId: 'tech-b',
        reason: 'TECHNICIAN_ILL',
        recentVisits: [],
      }).outcome,
    ).toBe('ALLOW');
  });

  it('measures the continuity rate honestly', () => {
    expect(
      continuityRate({
        assignedTechnicianId: 'tech-a',
        recentVisits: [
          { technicianId: 'tech-a' },
          { technicianId: 'tech-a' },
          { technicianId: 'tech-b' },
          { technicianId: 'tech-a' },
        ],
      }),
    ).toBe(0.75);
  });

  it('writes the family a message that explains rather than announces', () => {
    const message = substitutionMessage({
      familyContactName: 'Anjali',
      patientName: 'Lakshmi',
      originalTechnicianName: 'Priya',
      replacementTechnicianName: 'Ramesh',
      reason: 'TECHNICIAN_ILL',
      visitDate: 'Tuesday 14th',
    });
    expect(message).toContain('Anjali');
    expect(message).toContain('Ramesh');
    expect(message).toMatch(/unwell/i);
    // It must offer a way out, not just inform.
    expect(message).toMatch(/reschedule at no charge/i);
  });
});

// --- NABL routing ------------------------------------------------------------

describe('labRouting — the NABL gate', () => {
  const future = new Date(Date.now() + 300 * 86_400_000);
  const past = new Date(Date.now() - 10 * 86_400_000);

  const activeLab: RoutableLab = {
    id: 'lab-1',
    name: 'Ananya Diagnostics',
    status: 'ACTIVE',
    capacityCeiling: 40,
    todayVolume: 5,
    accreditation: {
      certificateNumber: 'MC-2417',
      scope: 'CLINICAL_BIOCHEMISTRY,HAEMATOLOGY,CLINICAL_PATHOLOGY,IMMUNOASSAY',
      validUntil: future,
    },
  };

  const hba1c = { code: 'HBA1C', name: 'HbA1c', discipline: 'CLINICAL_BIOCHEMISTRY' };
  const culture = { code: 'URINE_CS', name: 'Urine culture', discipline: 'MICROBIOLOGY' };

  it('accepts MC- numbers and REJECTS TC- with an explanation', () => {
    expect(validateCertificateNumber('MC-2417').outcome).toBe('ALLOW');
    expect(validateCertificateNumber('mc-0001').outcome).toBe('ALLOW');

    const tc = validateCertificateNumber('TC-8891');
    expect(tc.outcome).toBe('REFUSE');
    if (isRefusal(tc)) {
      // The applicant must learn WHY, not just that it failed.
      expect(tc.reason).toMatch(/testing and calibration/i);
      expect(tc.remedy).toMatch(/ISO 15189|MC-/);
    }

    expect(validateCertificateNumber('12345').outcome).toBe('REFUSE');
    expect(validateCertificateNumber('MC-24').outcome).toBe('REFUSE');
  });

  it('routes a test the lab is accredited for', () => {
    expect(evaluateRouting(activeLab, [hba1c]).outcome).toBe('ALLOW');
  });

  it('REFUSES a test outside the accredited scope — the check most platforms skip', () => {
    const decision = evaluateRouting(activeLab, [culture]);
    expect(decision.outcome).toBe('REFUSE');
    if (isRefusal(decision)) {
      expect(decision.reason).toMatch(/not accredited for Microbiology/i);
      expect(decision.remedy).toMatch(/not a valid result/i);
    }
  });

  it('refuses when ANY test in a mixed order is out of scope', () => {
    expect(evaluateRouting(activeLab, [hba1c, culture]).outcome).toBe('REFUSE');
  });

  it('refuses a lab that is not ACTIVE, whatever its accreditation', () => {
    for (const status of ['SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'SUSPENDED', 'REJECTED']) {
      expect(evaluateRouting({ ...activeLab, status }, [hba1c]).outcome).toBe('REFUSE');
    }
  });

  it('refuses on expired accreditation', () => {
    const decision = evaluateRouting(
      { ...activeLab, accreditation: { ...activeLab.accreditation!, validUntil: past } },
      [hba1c],
    );
    expect(decision.outcome).toBe('REFUSE');
    if (isRefusal(decision)) expect(decision.reason).toMatch(/expired/i);
  });

  it('refuses at the capacity ceiling', () => {
    expect(evaluateRouting({ ...activeLab, todayVolume: 40 }, [hba1c]).outcome).toBe('REFUSE');
  });

  it('warns approaching expiry and approaching capacity', () => {
    const soon = new Date(Date.now() + 20 * 86_400_000);
    expect(
      evaluateRouting(
        { ...activeLab, accreditation: { ...activeLab.accreditation!, validUntil: soon } },
        [hba1c],
      ).outcome,
    ).toBe('WARN');
    expect(evaluateRouting({ ...activeLab, todayVolume: 35 }, [hba1c]).outcome).toBe('WARN');
  });

  it('parses a scope list tolerantly', () => {
    expect(parseScope(' clinical_biochemistry , HAEMATOLOGY ,, ')).toEqual([
      'CLINICAL_BIOCHEMISTRY',
      'HAEMATOLOGY',
    ]);
  });

  describe('selectLab', () => {
    const microLab: RoutableLab & { distanceKm: number } = {
      id: 'lab-2',
      name: 'Sanjeevini Microbiology',
      status: 'ACTIVE',
      capacityCeiling: 25,
      todayVolume: 1,
      distanceKm: 0.5,
      accreditation: {
        certificateNumber: 'MC-3902',
        scope: 'MICROBIOLOGY',
        validUntil: future,
      },
    };

    it('skips the nearest lab when it cannot legally process the order', () => {
      const result = selectLab([microLab, { ...activeLab, distanceKm: 3.2 }], [hba1c]);
      expect(result.lab?.id).toBe('lab-1');
      expect(result.rejections[0].labId).toBe('lab-2');
    });

    it('explains every rejection when nowhere is eligible', () => {
      const result = selectLab([microLab], [hba1c]);
      expect(result.lab).toBeNull();
      expect(result.decision.outcome).toBe('REFUSE');
      if (isRefusal(result.decision)) {
        expect(result.decision.remedy).toMatch(/not accredited/i);
      }
    });

    it('refuses clearly when no candidates were supplied at all', () => {
      const result = selectLab([], [hba1c]);
      expect(result.lab).toBeNull();
      if (isRefusal(result.decision)) {
        expect(result.decision.remedy).toMatch(/anchor lab/i);
      }
    });
  });
});

// --- critical values ---------------------------------------------------------

describe('criticalValue', () => {
  it('will not close an alert before the call is made', () => {
    const decision = evaluateAlertClosure({
      calledAt: null,
      callNote: '',
      writtenFollowUpSentAt: null,
    });
    expect(decision.outcome).toBe('REFUSE');
    if (isRefusal(decision)) expect(decision.remedy).toMatch(/never waits/i);
  });

  it('will not close on a bare timestamp with no note', () => {
    expect(
      evaluateAlertClosure({
        calledAt: new Date(),
        callNote: 'ok',
        writtenFollowUpSentAt: new Date(),
      }).outcome,
    ).toBe('REFUSE');
  });

  it('will not close without the written follow-up', () => {
    expect(
      evaluateAlertClosure({
        calledAt: new Date(),
        callNote: 'Spoke to Anjali, she will call the physician this morning.',
        writtenFollowUpSentAt: null,
      }).outcome,
    ).toBe('REFUSE');
  });

  it('closes only when the whole protocol is complete', () => {
    expect(
      evaluateAlertClosure({
        calledAt: new Date(),
        callNote: 'Spoke to Anjali, she will call the physician this morning.',
        writtenFollowUpSentAt: new Date(),
      }).outcome,
    ).toBe('ALLOW');
  });

  it('escalates in minutes, not hours', () => {
    const now = new Date('2026-09-07T10:00:00Z');
    const ago = (m: number) => new Date(now.getTime() - m * 60_000);
    expect(escalationLevel(ago(2), now).level).toBe('NEW');
    expect(escalationLevel(ago(15), now).level).toBe('URGENT');
    expect(escalationLevel(ago(45), now).level).toBe('ESCALATE_TO_FOUNDER');
  });

  it('scripts a call that never interprets the value', () => {
    const script = buildCriticalCallScript({
      caregiverName: 'Anjali',
      patientName: 'Lakshmi',
      parameterName: 'HbA1c',
      coordinatorName: 'Yeshwin',
    });
    const spoken = script.lines.join(' ');
    expect(spoken).toMatch(/not able to explain what the result means/i);
    expect(spoken).toMatch(/108/);
    // No numbers, no diagnosis, no reassurance.
    expect(spoken).not.toMatch(/\b\d+(\.\d+)?\s*(mg|mmol|%)/i);
    expect(spoken).not.toMatch(/diabet|probably fine|don't worry/i);
    expect(script.neverSay.length).toBeGreaterThanOrEqual(4);
  });
});

// --- follow-up ---------------------------------------------------------------

describe('followUp', () => {
  it('falls due 24 hours after release', () => {
    const released = new Date('2026-09-07T18:00:00Z');
    expect(dueBy(released).toISOString()).toBe('2026-09-08T18:00:00.000Z');
  });

  it('classifies urgency', () => {
    const now = new Date('2026-09-07T12:00:00Z');
    const inHours = (h: number) => new Date(now.getTime() + h * 3_600_000);
    expect(urgency(inHours(20), now).level).toBe('SCHEDULED');
    expect(urgency(inHours(3), now).level).toBe('DUE_SOON');
    expect(urgency(inHours(-5), now).level).toBe('OVERDUE');
    expect(urgency(inHours(-5), now).label).toMatch(/overdue/i);
  });

  it('REFUSES completion without both answers', () => {
    expect(
      evaluateCompletion({ whatWorriedYou: '', whatWouldImprove: 'More printouts' }).outcome,
    ).toBe('REFUSE');
    expect(
      evaluateCompletion({ whatWorriedYou: 'The wait', whatWouldImprove: '' }).outcome,
    ).toBe('REFUSE');
  });

  it('accepts "nothing" as an answer, because it is one', () => {
    expect(
      evaluateCompletion({ whatWorriedYou: 'nothing', whatWouldImprove: 'nothing' }).outcome,
    ).toBe('ALLOW');
  });
});

// --- visit window ------------------------------------------------------------

describe('visitWindow', () => {
  const windowStart = new Date('2026-09-08T01:00:00Z');
  const windowEnd = new Date('2026-09-08T02:00:00Z');

  it('classifies arrival against the promised window', () => {
    expect(classifyArrival({ windowStart, windowEnd, arrivedAt: null })).toBe('PENDING');
    expect(
      classifyArrival({ windowStart, windowEnd, arrivedAt: new Date('2026-09-08T00:50:00Z') }),
    ).toBe('EARLY');
    expect(
      classifyArrival({ windowStart, windowEnd, arrivedAt: new Date('2026-09-08T01:30:00Z') }),
    ).toBe('ON_TIME');
    expect(
      classifyArrival({ windowStart, windowEnd, arrivedAt: new Date('2026-09-08T02:20:00Z') }),
    ).toBe('LATE');
  });

  it('counts early as on-time — the patient was not made to wait', () => {
    expect(countsAsOnTime('EARLY')).toBe(true);
    expect(countsAsOnTime('ON_TIME')).toBe(true);
    expect(countsAsOnTime('LATE')).toBe(false);
    expect(countsAsOnTime('PENDING')).toBe(false);
  });

  it('demands the family be told BEFORE the window closes', () => {
    const check = projectArrival({
      technicianPosition: { lat: 12.99, lng: 77.65 }, // far away
      destination: ANCHOR,
      windowEnd,
      now: new Date('2026-09-08T01:50:00Z'),
      alreadyNotified: false,
    });
    expect(check.willBreachWindow).toBe(true);
    expect(check.decision.outcome).toBe('REFUSE');
    if (isRefusal(check.decision)) {
      expect(check.decision.remedy).toMatch(/silence is not/i);
    }
  });

  it('drops to a warning once the family has been told', () => {
    const check = projectArrival({
      technicianPosition: { lat: 12.99, lng: 77.65 },
      destination: ANCHOR,
      windowEnd,
      now: new Date('2026-09-08T01:50:00Z'),
      alreadyNotified: true,
    });
    expect(check.decision.outcome).toBe('WARN');
  });

  it('offers only morning slots — fasting samples and route density', () => {
    const slots = morningSlots(new Date('2026-09-08T00:00:00'));
    expect(slots.length).toBeGreaterThanOrEqual(3);
    for (const slot of slots) {
      expect(slot.start.getHours()).toBeGreaterThanOrEqual(6);
      expect(slot.end.getHours()).toBeLessThanOrEqual(10);
    }
  });
});

// --- metrics and gates -------------------------------------------------------

describe('metrics', () => {
  it('computes the six numbers', () => {
    const sheet = computeMondaySheet({
      completedVisits: 100,
      arrivedWithinWindow: 92,
      collectedSpecimens: 100,
      rejectedSpecimens: 1,
      cohortReachingMonthThree: 20,
      stillActiveAtMonthThree: 18,
      visitsAcrossMornings: 140,
      technicianMornings: 20,
      releasedReports: 50,
      reportsWithFollowUpCallDone: 50,
      newFamiliesThisPeriod: 10,
      newFamiliesFromReferral: 4,
      activeSubscribers: 62,
      contributionMarginPaise: 120_000,
    });

    expect(sheet.onTimeWithinWindowPct).toBe(92);
    expect(sheet.sampleRejectionPct).toBe(1);
    expect(sheet.monthThreeRetentionPct).toBe(90);
    expect(sheet.visitsPerTechnicianPerMorning).toBe(7);
    expect(sheet.followUpCallCompletionPct).toBe(100);
    expect(sheet.referralSharePct).toBe(40);
  });

  it('never divides by zero on an empty business', () => {
    const empty = computeMondaySheet({
      completedVisits: 0, arrivedWithinWindow: 0, collectedSpecimens: 0,
      rejectedSpecimens: 0, cohortReachingMonthThree: 0, stillActiveAtMonthThree: 0,
      visitsAcrossMornings: 0, technicianMornings: 0, releasedReports: 0,
      reportsWithFollowUpCallDone: 0, newFamiliesThisPeriod: 0,
      newFamiliesFromReferral: 0, activeSubscribers: 0, contributionMarginPaise: 0,
    });
    for (const value of Object.values(empty)) expect(Number.isFinite(value)).toBe(true);
  });

  it('marks a healthy sheet good and a failing one bad', () => {
    const good = judge(
      computeMondaySheet({
        completedVisits: 100, arrivedWithinWindow: 95, collectedSpecimens: 100,
        rejectedSpecimens: 1, cohortReachingMonthThree: 20, stillActiveAtMonthThree: 18,
        visitsAcrossMornings: 140, technicianMornings: 20, releasedReports: 10,
        reportsWithFollowUpCallDone: 10, newFamiliesThisPeriod: 10,
        newFamiliesFromReferral: 4, activeSubscribers: 62, contributionMarginPaise: 1,
      }),
    );
    expect(good.every((v) => v.health === 'GOOD')).toBe(true);

    const bad = judge(
      computeMondaySheet({
        completedVisits: 100, arrivedWithinWindow: 50, collectedSpecimens: 100,
        rejectedSpecimens: 20, cohortReachingMonthThree: 20, stillActiveAtMonthThree: 5,
        visitsAcrossMornings: 40, technicianMornings: 20, releasedReports: 10,
        reportsWithFollowUpCallDone: 2, newFamiliesThisPeriod: 10,
        newFamiliesFromReferral: 0, activeSubscribers: 3, contributionMarginPaise: -1,
      }),
    );
    expect(bad.every((v) => v.health === 'BAD')).toBe(true);
  });

  it('works the contribution model', () => {
    const result = computeContribution({
      subscriptionRevenuePaise: paise(1799),
      labCostPaise: paise(450),
      technicianCostPaise: paise(250),
      consumablesPaise: paise(120),
      transportPaise: paise(80),
      supportPaise: paise(120),
      activeSubscribers: 1,
    });
    expect(result.perSubscriberPaise).toBe(paise(779));
    expect(result.marginPct).toBeCloseTo(43.3, 0);
    expect(result.twelveMonthPerSubscriberPaise).toBe(paise(9348));
    // CAC ceiling around three months of contribution.
    expect(result.cacPaybackMonths).toBeGreaterThan(2.5);
    expect(result.cacPaybackMonths).toBeLessThan(4);
  });
});

describe('growthGates', () => {
  const healthy = computeMondaySheet({
    completedVisits: 100, arrivedWithinWindow: 95, collectedSpecimens: 100,
    rejectedSpecimens: 1, cohortReachingMonthThree: 20, stillActiveAtMonthThree: 18,
    visitsAcrossMornings: 140, technicianMornings: 20, releasedReports: 10,
    reportsWithFollowUpCallDone: 10, newFamiliesThisPeriod: 10,
    newFamiliesFromReferral: 4, activeSubscribers: 62, contributionMarginPaise: 50_000,
  });

  it('LOCKS zone two on a young business, and says which criteria are missing', () => {
    const gate = evaluateZoneTwoUnlock({
      current: { ...healthy, activeSubscribers: 12 },
      onTimeHistoryWeekly: [95, 94],
      technicianCount: 1,
      hasSignedLabAgreement: true,
    });
    expect(gate.passed).toBe(false);
    const unmet = gate.criteria.filter((c) => !c.met).map((c) => c.key);
    expect(unmet).toContain('activeSubscribers');
    expect(unmet).toContain('onTimeStreak');
    expect(gate.guidance).toMatch(/waitlist/i);
  });

  it('unlocks zone two only on a 13-week on-time streak', () => {
    const base = {
      current: healthy,
      technicianCount: 1,
      hasSignedLabAgreement: true,
    };
    expect(
      evaluateZoneTwoUnlock({ ...base, onTimeHistoryWeekly: Array(12).fill(95) }).passed,
    ).toBe(false);
    expect(
      evaluateZoneTwoUnlock({ ...base, onTimeHistoryWeekly: Array(13).fill(95) }).passed,
    ).toBe(true);
  });

  it('breaks the streak on a single bad week', () => {
    const history = Array(13).fill(95);
    history[3] = 82; // one bad week, four weeks ago
    expect(
      evaluateZoneTwoUnlock({
        current: healthy,
        onTimeHistoryWeekly: history,
        technicianCount: 1,
        hasSignedLabAgreement: true,
      }).passed,
    ).toBe(false);
  });

  it('keeps the marketplace locked without referral traction', () => {
    const gate = evaluateMarketplaceUnlock({
      current: { ...healthy, referralSharePct: 4 },
      onTimeHistoryWeekly: Array(13).fill(95),
      technicianCount: 1,
      hasSignedLabAgreement: true,
    });
    expect(gate.passed).toBe(false);
    expect(gate.guidance).toMatch(/not remarkable enough/i);
  });

  it('refuses a second technician before density supports one', () => {
    expect(
      evaluateSecondTechnician({
        current: { ...healthy, visitsPerTechnicianPerMorning: 3.4 },
        onTimeHistoryWeekly: [],
        technicianCount: 1,
        hasSignedLabAgreement: true,
      }).passed,
    ).toBe(false);

    expect(
      evaluateSecondTechnician({
        current: healthy,
        onTimeHistoryWeekly: [],
        technicianCount: 1,
        hasSignedLabAgreement: true,
      }).passed,
    ).toBe(true);
  });
});

// --- supporting utilities ----------------------------------------------------

describe('money', () => {
  it('formats with Indian digit grouping', () => {
    expect(formatINR(paise(1799))).toBe('₹1,799');
    expect(formatINR(paise(179900))).toBe('₹1,79,900'); // lakh grouping, not thousands
  });

  it('renders amounts in words for the elderly surfaces', () => {
    expect(numberToWordsIN(paise(1799))).toBe('one thousand seven hundred ninety nine rupees');
    expect(numberToWordsIN(paise(799))).toBe('seven hundred ninety nine rupees');
    expect(numberToWordsIN(paise(2999))).toBe('two thousand nine hundred ninety nine rupees');
    expect(numberToWordsIN(paise(100000))).toBe('one lakh rupees');
    expect(numberToWordsIN(0)).toBe('zero rupees');
  });

  it('prices an annual prepay as ten months', () => {
    expect(annualFromMonthly(paise(1799))).toBe(paise(1799 * 10));
  });

  it('applies founding-cohort pricing', () => {
    expect(applyDiscount(paise(1799), 40)).toBe(paise(1079.4));
    expect(applyDiscount(paise(1799), 0)).toBe(paise(1799));
  });
});

describe('geo', () => {
  it('measures real distances', () => {
    // Jayanagar to Whitefield is roughly 17-19 km.
    const d = haversineKm(ANCHOR, { lat: 12.9698, lng: 77.75 });
    expect(d).toBeGreaterThan(15);
    expect(d).toBeLessThan(22);
    expect(haversineKm(ANCHOR, ANCHOR)).toBe(0);
  });

  it('round-trips a polyline', () => {
    const points = [
      { lat: 12.925, lng: 77.5838 },
      { lat: 12.9262, lng: 77.5841 },
      { lat: 12.9274, lng: 77.5852 },
    ];
    const decoded = decodePolyline(encodePolyline(points));
    expect(decoded).toHaveLength(3);
    decoded.forEach((p, i) => {
      expect(p.lat).toBeCloseTo(points[i].lat, 4);
      expect(p.lng).toBeCloseTo(points[i].lng, 4);
    });
  });

  it('tests polygon containment', () => {
    const square = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 },
      { lat: 2, lng: 2 },
      { lat: 2, lng: 0 },
    ];
    expect(pointInPolygon({ lat: 1, lng: 1 }, square)).toBe(true);
    expect(pointInPolygon({ lat: 3, lng: 1 }, square)).toBe(false);
    expect(pointInPolygon({ lat: 1, lng: 1 }, [])).toBe(false);
  });
});

describe('age banding', () => {
  it('maps to the blueprint bands', () => {
    expect(ageBandFor(64)).toBe('BAND_60_70');
    expect(ageBandFor(70)).toBe('BAND_70_80');
    expect(ageBandFor(79)).toBe('BAND_70_80');
    expect(ageBandFor(80)).toBe('BAND_80_PLUS');
    expect(ageBandFor(92)).toBe('BAND_80_PLUS');
  });
});
