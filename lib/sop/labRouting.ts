/**
 * The lab routing gate.
 *
 * Registering a lab is an application, not an activation. Before a single vial
 * is routed anywhere, four things must hold at once:
 *
 *   1. the lab is ACTIVE (a human cleared the seven-point checklist),
 *   2. its NABL accreditation has not expired,
 *   3. its accredited SCOPE covers the discipline of the test being routed,
 *   4. it is under its agreed daily capacity ceiling.
 *
 * Check 3 is the one most platforms skip. An HbA1c is Clinical Biochemistry;
 * routing it to a lab accredited only for Microbiology produces a number that
 * looks exactly like a real result and is not one.
 */

import { Discipline, DISCIPLINE_LABELS, type LabStatus } from '../enums';
import { allow, refuse, warn, type Decision } from './types';

export interface RoutableLab {
  id: string;
  name: string;
  status: LabStatus | string;
  capacityCeiling: number;
  /** Samples already routed to this lab today. */
  todayVolume: number;
  accreditation: {
    certificateNumber: string;
    /** Comma-separated discipline keys. */
    scope: string;
    validUntil: Date;
  } | null;
}

export interface RoutableTest {
  code: string;
  name: string;
  discipline: string;
}

export function parseScope(scope: string): string[] {
  return scope
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

/**
 * Medical laboratories carry MC-XXXX. TC-XXXX is a testing/calibration
 * laboratory — a real NABL accreditation, but not one that covers human
 * diagnostic samples. Accepting it silently is how blood ends up somewhere it
 * should never be.
 */
export function validateCertificateNumber(input: string): Decision {
  const value = input.trim().toUpperCase();

  if (/^MC-\d{4}$/.test(value)) return allow();

  if (/^TC-\d{4}$/.test(value)) {
    return refuse(
      `${value} is a testing and calibration laboratory accreditation, not a medical laboratory one.`,
      'Medical laboratories are accredited under ISO 15189 and carry a certificate number in the form MC-1234. Please supply that certificate instead.',
      { supplied: value, expectedPrefix: 'MC' },
    );
  }

  return refuse(
    `"${input}" is not a recognised NABL medical laboratory certificate number.`,
    'Enter the number exactly as printed on the certificate, in the form MC-1234.',
    { supplied: input },
  );
}

export function isAccreditationCurrent(validUntil: Date, now = new Date()): boolean {
  return validUntil.getTime() > now.getTime();
}

/**
 * The hard gate. Called on every booking. Returning a refusal here is not an
 * error condition to be worked around — it is the system doing its job.
 */
export function evaluateRouting(
  lab: RoutableLab,
  tests: RoutableTest[],
  now = new Date(),
): Decision {
  if (lab.status !== 'ACTIVE') {
    return refuse(
      `${lab.name} is ${String(lab.status).toLowerCase().replace(/_/g, ' ')}, not active.`,
      'Only a lab that has cleared NABL verification can receive samples. Complete the verification checklist in the ops console, or route to a different active lab.',
      { labId: lab.id, status: lab.status },
    );
  }

  if (!lab.accreditation) {
    return refuse(
      `${lab.name} has no accreditation record.`,
      'Capture the NABL certificate, scope and validity dates before routing anything to this lab.',
      { labId: lab.id },
    );
  }

  if (!isAccreditationCurrent(lab.accreditation.validUntil, now)) {
    return refuse(
      `${lab.name}'s accreditation (${lab.accreditation.certificateNumber}) expired on ${lab.accreditation.validUntil.toISOString().slice(0, 10)}.`,
      'Suspend the lab and obtain the renewed certificate. An expired accreditation is the same as none.',
      { labId: lab.id, validUntil: lab.accreditation.validUntil.toISOString() },
    );
  }

  const scope = parseScope(lab.accreditation.scope);
  const uncovered = tests.filter((t) => !scope.includes(t.discipline.toUpperCase()));

  if (uncovered.length > 0) {
    const disciplines = [...new Set(uncovered.map((t) => t.discipline))];
    const readable = disciplines
      .map((d) => DISCIPLINE_LABELS[d as Discipline] ?? d)
      .join(', ');
    return refuse(
      `${lab.name} is not accredited for ${readable}, which ${uncovered.length === 1 ? `${uncovered[0].name} requires` : 'these tests require'}.`,
      'Route these tests to a lab whose accredited scope covers them, or split the order. A result produced outside a lab’s accredited scope is not a valid result.',
      {
        labId: lab.id,
        uncoveredTests: uncovered.map((t) => t.code),
        missingDisciplines: disciplines,
        labScope: scope,
      },
    );
  }

  if (lab.todayVolume >= lab.capacityCeiling) {
    return refuse(
      `${lab.name} is at its agreed daily ceiling of ${lab.capacityCeiling} samples.`,
      'Give the lab advance notice before exceeding the ceiling, or route to another active lab. Overwhelming a partner’s operation is how the relationship — and the turnaround time — breaks.',
      { labId: lab.id, todayVolume: lab.todayVolume, ceiling: lab.capacityCeiling },
    );
  }

  const daysToExpiry = Math.ceil(
    (lab.accreditation.validUntil.getTime() - now.getTime()) / 86_400_000,
  );
  if (daysToExpiry <= 30) {
    return warn(
      `${lab.name}'s accreditation expires in ${daysToExpiry} days. Chase the renewal now.`,
      { labId: lab.id, daysToExpiry },
    );
  }

  if (lab.todayVolume >= lab.capacityCeiling * 0.85) {
    return warn(
      `${lab.name} is at ${lab.todayVolume} of ${lab.capacityCeiling} samples today.`,
      { labId: lab.id },
    );
  }

  return allow();
}

/**
 * Picks the nearest active lab that can legally process the whole order.
 * Returns a refusal explaining every rejection rather than a bare null, so an
 * operator can see *why* nowhere was eligible.
 */
export function selectLab(
  candidates: (RoutableLab & { distanceKm: number })[],
  tests: RoutableTest[],
  now = new Date(),
): { lab: RoutableLab | null; decision: Decision; rejections: { labId: string; reason: string }[] } {
  const rejections: { labId: string; reason: string }[] = [];
  const byDistance = [...candidates].sort((a, b) => a.distanceKm - b.distanceKm);

  for (const lab of byDistance) {
    const decision = evaluateRouting(lab, tests, now);
    if (decision.outcome === 'REFUSE') {
      rejections.push({ labId: lab.id, reason: decision.reason });
      continue;
    }
    return { lab, decision, rejections };
  }

  return {
    lab: null,
    decision: refuse(
      'No accredited lab in range can process this order.',
      rejections.length
        ? `Every candidate was rejected: ${rejections.map((r) => r.reason).join(' ')}`
        : 'No lab candidates were supplied at all — check the zone’s anchor lab.',
      { rejections },
    ),
    rejections,
  };
}
