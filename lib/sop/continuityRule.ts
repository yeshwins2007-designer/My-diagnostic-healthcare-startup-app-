/**
 * Continuity — the actual product.
 *
 * "Same technician for the same family, unless illness or leave prevents it —
 * then a personal message explaining the substitution." A national platform
 * structurally cannot promise this. It is the whole reason a family pays
 * monthly rather than booking whoever is cheapest, so the software treats a
 * substitution as an exception requiring a reason, not a scheduling detail.
 */

import { allow, refuse, type Decision } from './types';

export const SUBSTITUTION_REASONS = [
  'TECHNICIAN_ILL',
  'TECHNICIAN_ON_LEAVE',
  'TECHNICIAN_LEFT',
  'ROUTE_CONFLICT',
  'FAMILY_REQUESTED_CHANGE',
  'PATIENT_NEEDS_DIFFERENT_LANGUAGE',
] as const;

export type SubstitutionReason = (typeof SUBSTITUTION_REASONS)[number];

export const SUBSTITUTION_LABELS: Record<SubstitutionReason, string> = {
  TECHNICIAN_ILL: 'Assigned technician is unwell',
  TECHNICIAN_ON_LEAVE: 'Assigned technician is on leave',
  TECHNICIAN_LEFT: 'Assigned technician has left',
  ROUTE_CONFLICT: 'Unavoidable route conflict this morning',
  FAMILY_REQUESTED_CHANGE: 'The family asked for a different technician',
  PATIENT_NEEDS_DIFFERENT_LANGUAGE: 'Patient needs a technician who speaks their language',
};

export interface ContinuityContext {
  /** Who the subscription promised. Null for a first visit. */
  assignedTechnicianId: string | null;
  proposedTechnicianId: string;
  reason?: SubstitutionReason | null;
  /** How many of the last visits used the assigned technician. */
  recentVisits: { technicianId: string | null }[];
}

export function evaluateContinuity(ctx: ContinuityContext): Decision {
  // First ever visit: whoever we assign becomes the promise from here on.
  if (!ctx.assignedTechnicianId) return allow();

  if (ctx.assignedTechnicianId === ctx.proposedTechnicianId) return allow();

  if (!ctx.reason) {
    return refuse(
      'This family is promised the same technician every month, and this is a different person.',
      'Pick the assigned technician, or select a substitution reason — the family will be sent a personal message explaining the change before the visit.',
      { assignedTechnicianId: ctx.assignedTechnicianId },
    );
  }

  return allow();
}

/**
 * The proportion of recent visits served by the promised technician. This is
 * the number that tells you whether continuity is real or aspirational; it
 * belongs next to retention, because it explains it.
 */
export function continuityRate(ctx: {
  assignedTechnicianId: string | null;
  recentVisits: { technicianId: string | null }[];
}): number {
  if (!ctx.assignedTechnicianId || ctx.recentVisits.length === 0) return 1;
  const matched = ctx.recentVisits.filter(
    (v) => v.technicianId === ctx.assignedTechnicianId,
  ).length;
  return matched / ctx.recentVisits.length;
}

/**
 * The message the family gets *before* the visit, not after. Silence about a
 * substitution is what turns a small change into a broken promise.
 */
export function substitutionMessage(input: {
  familyContactName: string;
  patientName: string;
  originalTechnicianName: string;
  replacementTechnicianName: string;
  reason: SubstitutionReason;
  visitDate: string;
}): string {
  const because: Record<SubstitutionReason, string> = {
    TECHNICIAN_ILL: `${input.originalTechnicianName} is unwell today`,
    TECHNICIAN_ON_LEAVE: `${input.originalTechnicianName} is on leave`,
    TECHNICIAN_LEFT: `${input.originalTechnicianName} no longer works with us`,
    ROUTE_CONFLICT: `${input.originalTechnicianName} could not be routed to you this morning`,
    FAMILY_REQUESTED_CHANGE: 'you asked for a change',
    PATIENT_NEEDS_DIFFERENT_LANGUAGE: 'we wanted someone who speaks your language comfortably',
  };

  return [
    `Dear ${input.familyContactName},`,
    '',
    `For ${input.patientName}'s visit on ${input.visitDate}, ${input.replacementTechnicianName} will come instead of ${input.originalTechnicianName}, because ${because[input.reason]}.`,
    '',
    `${input.replacementTechnicianName} has been briefed on ${input.patientName}'s conditions and how they prefer the visit to go. If you would rather wait for ${input.originalTechnicianName}, reply here and we will reschedule at no charge.`,
  ].join('\n');
}
