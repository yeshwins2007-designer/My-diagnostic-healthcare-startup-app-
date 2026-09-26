'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import { audit } from '@/lib/compliance/audit';
import { bookingReference } from '@/lib/compliance/crypto';
import {
  classifyReading,
  evaluateHandoffReadiness,
  isBreach,
} from '@/lib/sop/coldChain';
import { readClock, budgetForSpecimens, evaluateIntake } from '@/lib/sop/sampleClock';
import { isRefusal } from '@/lib/sop/types';
import { CHECKLIST_STEPS, type ChecklistStepKey } from '@/lib/enums';

export interface FieldActionState {
  ok: boolean;
  message?: string;
  reason?: string;
  remedy?: string;
}

async function technicianOrThrow() {
  const user = await requireRole('TECHNICIAN');
  const technician = await db.technician.findUnique({ where: { userId: user.id } });
  if (!technician) throw new Error('No technician profile for this account.');
  return { user, technician };
}

/** Starting the route is what opens the window in which GPS is accepted. */
export async function startRoute(routeId: string): Promise<FieldActionState> {
  const { user, technician } = await technicianOrThrow();

  const route = await db.route.findFirst({
    where: { id: routeId, technicianId: technician.id },
  });
  if (!route) return { ok: false, message: 'Route not found.' };

  await db.route.update({
    where: { id: routeId },
    data: { status: 'STARTED', startedAt: new Date() },
  });

  await audit({
    action: 'BOOKING_STATUS_CHANGED',
    entityType: 'Route',
    entityId: routeId,
    actorUserId: user.id,
    actorRole: 'TECHNICIAN',
    detail: { event: 'route_started' },
  });

  revalidatePath('/field');
  return { ok: true, message: 'Route started. Your location is now being recorded.' };
}

/** Ending the route closes it. Nothing is recorded after this. */
export async function endRoute(routeId: string): Promise<FieldActionState> {
  const { user, technician } = await technicianOrThrow();

  await db.route.updateMany({
    where: { id: routeId, technicianId: technician.id },
    data: { status: 'COMPLETED', endedAt: new Date() },
  });

  await audit({
    action: 'BOOKING_STATUS_CHANGED',
    entityType: 'Route',
    entityId: routeId,
    actorUserId: user.id,
    actorRole: 'TECHNICIAN',
    detail: { event: 'route_ended' },
  });

  revalidatePath('/field');
  return { ok: true, message: 'Route ended. Location recording has stopped.' };
}

export async function markArrived(bookingId: string): Promise<FieldActionState> {
  const { user, technician } = await technicianOrThrow();

  const booking = await db.booking.findFirst({
    where: { id: bookingId, technicianId: technician.id },
  });
  if (!booking) return { ok: false, message: 'Visit not found.' };

  await db.booking.update({
    where: { id: bookingId },
    data: { status: 'ARRIVED', arrivedAt: new Date() },
  });

  await audit({
    action: 'BOOKING_STATUS_CHANGED',
    entityType: 'Booking',
    entityId: bookingId,
    actorUserId: user.id,
    actorRole: 'TECHNICIAN',
    detail: { status: 'ARRIVED', reference: booking.reference },
  });

  revalidatePath(`/field/visit/${bookingId}`);
  return { ok: true, message: 'Arrival recorded.' };
}

// --- consent -----------------------------------------------------------------

const consentSchema = z.object({
  bookingId: z.string().min(1),
  granted: z.coerce.boolean(),
  method: z.enum(['WRITTEN', 'VERBAL_RECORDED', 'DIGITAL_TAP', 'PROXY_FAMILY']),
  proxyName: z.string().max(120).optional(),
  proxyRelation: z.string().max(120).optional(),
});

/**
 * Consent at the door. Where the patient lacks capacity, a documented family
 * authorisation is recorded instead — and which one it was is stored, not
 * flattened into a single "consented" flag.
 */
export async function recordConsent(
  _prev: FieldActionState,
  formData: FormData,
): Promise<FieldActionState> {
  const { user, technician } = await technicianOrThrow();

  const parsed = consentSchema.safeParse({
    ...Object.fromEntries(formData),
    granted: formData.get('granted') === 'yes',
  });
  if (!parsed.success) return { ok: false, message: 'Please record the consent properly.' };

  const booking = await db.booking.findFirst({
    where: { id: parsed.data.bookingId, technicianId: technician.id },
    include: { patient: true },
  });
  if (!booking) return { ok: false, message: 'Visit not found.' };

  if (booking.patient.needsProxyConsent && parsed.data.method !== 'PROXY_FAMILY') {
    return {
      ok: false,
      reason: `${booking.patient.name} cannot give informed consent themselves.`,
      remedy:
        'Record family authorisation instead, with the name and relationship of the person authorising. If nobody is present who can, stop and call the coordinator.',
    };
  }

  await db.consentRecord.create({
    data: {
      patientId: booking.patientId,
      bookingId: booking.id,
      purpose: 'SAMPLE_COLLECTION',
      granted: parsed.data.granted,
      policyVersion: 'v1',
      method: parsed.data.method,
      proxyName: parsed.data.proxyName || null,
      proxyRelation: parsed.data.proxyRelation || null,
    },
  });

  await audit({
    action: parsed.data.granted ? 'CONSENT_GRANTED' : 'CONSENT_WITHDRAWN',
    entityType: 'Booking',
    entityId: booking.id,
    actorUserId: user.id,
    actorRole: 'TECHNICIAN',
    detail: { method: parsed.data.method, granted: parsed.data.granted },
  });

  if (!parsed.data.granted) {
    await db.booking.update({
      where: { id: booking.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: 'Patient declined at the door.',
      },
    });
    return {
      ok: true,
      message:
        'Recorded. Do not collect. Thank them, leave politely, and tell the coordinator so we can call the family.',
    };
  }

  await completeStep(booking.id, 'IDENTITY_CONFIRMED_AND_CONSENT');
  revalidatePath(`/field/visit/${booking.id}`);
  return { ok: true, message: 'Consent recorded.' };
}

// --- collection --------------------------------------------------------------

const collectSchema = z.object({
  bookingId: z.string().min(1),
  identifier1: z.string().min(2),
  identifier2: z.string().min(2),
  tubeType: z.string().min(2),
  labelledAtBedside: z.coerce.boolean(),
});

/**
 * Bedside labelling. Two identifiers on every vial, at the bedside, never
 * afterwards — the single control that prevents the worst thing this business
 * can do, which is attach one person's result to another person's name.
 */
export async function recordCollection(
  _prev: FieldActionState,
  formData: FormData,
): Promise<FieldActionState> {
  const { user, technician } = await technicianOrThrow();

  const parsed = collectSchema.safeParse({
    ...Object.fromEntries(formData),
    labelledAtBedside: formData.get('labelledAtBedside') === 'on',
  });
  if (!parsed.success) return { ok: false, message: 'Fill in both identifiers and the tube type.' };

  if (!parsed.data.labelledAtBedside) {
    return {
      ok: false,
      reason: 'The vial has not been confirmed as labelled at the bedside.',
      remedy:
        'Label it now, in front of the patient, with two identifiers. Labelling afterwards — in the lift, on the bike — is how samples get swapped.',
    };
  }

  const booking = await db.booking.findFirst({
    where: { id: parsed.data.bookingId, technicianId: technician.id },
    include: { items: { include: { panel: { include: { items: { include: { test: true } } } } } } },
  });
  if (!booking) return { ok: false, message: 'Visit not found.' };

  const now = new Date();

  await db.specimen.create({
    data: {
      bookingId: booking.id,
      barcode: `SPC-${bookingReference().replace('SS-', '')}`,
      tubeType: parsed.data.tubeType,
      identifier1: parsed.data.identifier1,
      identifier2: parsed.data.identifier2,
      labelledAtBedside: true,
      collectedAt: now,
      // This is the moment the two-hour clock starts.
      clockStartsAt: now,
      status: 'COLLECTED',
    },
  });

  await db.booking.update({
    where: { id: booking.id },
    data: { status: 'COLLECTED' },
  });

  await completeStep(booking.id, 'LABELLED_AT_BEDSIDE');

  await audit({
    action: 'BOOKING_STATUS_CHANGED',
    entityType: 'Booking',
    entityId: booking.id,
    actorUserId: user.id,
    actorRole: 'TECHNICIAN',
    detail: { status: 'COLLECTED', labelledAtBedside: true },
  });

  revalidatePath(`/field/visit/${booking.id}`);
  return { ok: true, message: 'Collected. The two-hour clock has started.' };
}

// --- cold chain --------------------------------------------------------------

const tempSchema = z.object({
  specimenId: z.string().min(1),
  temperatureC: z.coerce.number().min(-20).max(50),
  boxSealed: z.coerce.boolean(),
});

export async function logTemperature(
  _prev: FieldActionState,
  formData: FormData,
): Promise<FieldActionState> {
  const { user } = await technicianOrThrow();

  const parsed = tempSchema.safeParse({
    ...Object.fromEntries(formData),
    boxSealed: formData.get('boxSealed') === 'on',
  });
  if (!parsed.success) return { ok: false, message: 'Enter the temperature shown on the box.' };

  const breach = isBreach(parsed.data.temperatureC);

  await db.coldChainLog.create({
    data: {
      specimenId: parsed.data.specimenId,
      temperatureC: parsed.data.temperatureC,
      isBreach: breach,
      boxSealed: parsed.data.boxSealed,
    },
  });

  await audit({
    action: breach ? 'COLD_CHAIN_BREACH' : 'COLD_CHAIN_LOGGED',
    entityType: 'Specimen',
    entityId: parsed.data.specimenId,
    actorUserId: user.id,
    actorRole: 'TECHNICIAN',
    detail: { temperatureC: parsed.data.temperatureC, sealed: parsed.data.boxSealed },
  });

  if (breach) {
    const specimen = await db.specimen.findUnique({
      where: { id: parsed.data.specimenId },
    });
    await db.incident.create({
      data: {
        bookingId: specimen?.bookingId ?? null,
        tier: 'TIER_1_CRITICAL',
        kind: 'COLD_CHAIN_BREACH',
        summary: `Cold box read ${parsed.data.temperatureC.toFixed(1)} °C, outside the 2–8 °C band.`,
        status: 'OPEN',
      },
    });
  }

  const decision = classifyReading(parsed.data.temperatureC);
  revalidatePath('/field');

  if (isRefusal(decision)) {
    return { ok: true, reason: decision.reason, remedy: decision.remedy };
  }
  return { ok: true, message: `Logged ${parsed.data.temperatureC.toFixed(1)} °C.` };
}

// --- handoff -----------------------------------------------------------------

const handoffSchema = z.object({
  specimenId: z.string().min(1),
  labId: z.string().min(1),
  receivedByName: z.string().min(2),
});

/**
 * The chain of custody closes here — but only if the box was sealed and its
 * temperature logged. A handoff record without temperature evidence is a
 * record of nothing, so the gate is real rather than advisory.
 */
export async function recordHandoff(
  _prev: FieldActionState,
  formData: FormData,
): Promise<FieldActionState> {
  const { user, technician } = await technicianOrThrow();

  const parsed = handoffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: 'Who received it at the intake desk?' };

  const specimen = await db.specimen.findUnique({
    where: { id: parsed.data.specimenId },
    include: {
      coldChainLogs: true,
      booking: {
        include: {
          items: { include: { panel: { include: { items: { include: { test: true } } } } } },
        },
      },
    },
  });
  if (!specimen) return { ok: false, message: 'Specimen not found.' };

  const readiness = evaluateHandoffReadiness({
    readings: specimen.coldChainLogs.map((l) => ({
      temperatureC: l.temperatureC,
      recordedAt: l.recordedAt,
      boxSealed: l.boxSealed,
    })),
    collectedAt: specimen.collectedAt,
  });

  if (isRefusal(readiness)) {
    return { ok: false, reason: readiness.reason, remedy: readiness.remedy };
  }

  const now = new Date();
  const stabilities = specimen.booking.items
    .flatMap((i) => i.panel?.items.map((pi) => pi.test.stabilityHours) ?? [])
    .filter(Boolean);

  const reading = readClock({
    clockStartsAt: specimen.clockStartsAt,
    intakeAt: now,
    budgetMinutes: budgetForSpecimens(stabilities),
  });
  const intake = evaluateIntake(reading);
  const breached = reading.elapsedMinutes > reading.budgetMinutes;

  await db.custodyHandoff.create({
    data: {
      specimenId: specimen.id,
      technicianId: technician.id,
      labId: parsed.data.labId,
      receivedByName: parsed.data.receivedByName,
      elapsedMinutes: reading.elapsedMinutes,
      isBreach: breached,
      handedOverAt: now,
    },
  });

  await db.specimen.update({
    where: { id: specimen.id },
    data: { intakeAt: now, status: 'RECEIVED' },
  });

  await db.booking.update({
    where: { id: specimen.bookingId },
    data: { status: 'AT_LAB' },
  });

  await completeStep(specimen.bookingId, 'HANDOVER_AT_LAB_INTAKE');

  await audit({
    action: 'CUSTODY_HANDOFF',
    entityType: 'Specimen',
    entityId: specimen.id,
    actorUserId: user.id,
    actorRole: 'TECHNICIAN',
    detail: {
      elapsedMinutes: reading.elapsedMinutes,
      breached,
      receivedBy: parsed.data.receivedByName,
    },
  });

  if (breached) {
    // A breach never disappears quietly into a log: it becomes an incident and
    // a free recollection.
    await db.incident.create({
      data: {
        bookingId: specimen.bookingId,
        tier: 'TIER_1_CRITICAL',
        kind: 'SAMPLE_CLOCK_BREACH',
        summary: `Collection to intake took ${reading.elapsedMinutes} minutes, past the ${reading.budgetMinutes}-minute limit.`,
      },
    });

    await audit({
      action: 'SAMPLE_CLOCK_BREACH',
      entityType: 'Specimen',
      entityId: specimen.id,
      actorUserId: user.id,
      actorRole: 'TECHNICIAN',
      detail: { elapsedMinutes: reading.elapsedMinutes },
    });
  }

  revalidatePath('/field');

  if (isRefusal(intake)) {
    return { ok: true, reason: intake.reason, remedy: intake.remedy };
  }
  return { ok: true, message: `Handed over in ${reading.elapsedMinutes} minutes.` };
}

/** Marks one SOP step complete, keeping the ordering intact. */
async function completeStep(bookingId: string, stepKey: ChecklistStepKey) {
  const step = CHECKLIST_STEPS.find((s) => s.key === stepKey);
  if (!step) return;

  await db.visitChecklistStep.updateMany({
    where: { bookingId, stepKey, completedAt: null },
    data: { completedAt: new Date() },
  });
}

export async function completeChecklistStep(
  bookingId: string,
  stepKey: ChecklistStepKey,
): Promise<FieldActionState> {
  await technicianOrThrow();
  await completeStep(bookingId, stepKey);
  revalidatePath(`/field/visit/${bookingId}`);
  return { ok: true };
}
