'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import { audit } from '@/lib/compliance/audit';
import { ageBandFor, VISIT_MINUTES_BY_MOBILITY } from '@/lib/enums';
import { evaluateRadius, type ZoneBoundary } from '@/lib/sop/radiusGuard';
import { evaluateRouting } from '@/lib/sop/labRouting';
import { isRefusal } from '@/lib/sop/types';
import { getMapsProvider } from '@/lib/providers/maps';
import { decodePolyline } from '@/lib/geo';

export interface CaregiverActionState {
  ok: boolean;
  message?: string;
  reason?: string;
  remedy?: string;
  /** Set when the address fell outside every zone and we offered the waitlist. */
  waitlisted?: boolean;
  distanceKm?: number;
}

const addPatientSchema = z.object({
  name: z.string().min(2).max(120),
  ageYears: z.coerce.number().int().min(40).max(120),
  sex: z.enum(['MALE', 'FEMALE', 'OTHER']),
  conditions: z.string().max(500).default(''),
  medications: z.string().max(500).default(''),
  mobility: z.enum(['INDEPENDENT', 'ASSISTED', 'HOUSEBOUND']),
  careNotes: z.string().max(1000).default(''),
  needsProxyConsent: z.coerce.boolean().default(false),
  line1: z.string().min(3).max(200),
  landmark: z.string().max(200).default(''),
  pincode: z.string().regex(/^\d{6}$/, 'A pincode is six digits.'),
  city: z.string().min(2).default('Bengaluru'),
  state: z.string().min(2).default('Karnataka'),
  /** Present when the caregiver dropped a pin by hand. */
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
});

/**
 * Adding a parent is where the radius rule bites.
 *
 * If the address falls outside every active zone the booking is refused into a
 * waitlist rather than accepted. That refusal is the single most valuable rule
 * in the system: a technician doing three visits a morning instead of eight
 * triples labour cost per visit and turns contribution margin negative.
 */
export async function addPatient(
  _prev: CaregiverActionState,
  formData: FormData,
): Promise<CaregiverActionState> {
  const user = await requireRole('CAREGIVER');

  const parsed = addPatientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Please check the details.' };
  }
  const input = parsed.data;

  const membership = await db.familyMember.findFirst({ where: { userId: user.id } });
  if (!membership) return { ok: false, message: 'No family account found for you.' };

  // Geocode, unless the caregiver dropped a pin themselves. Old Bengaluru
  // colonies frequently have no accurate geocode, which is exactly why the
  // manual pin and the landmark field exist.
  const maps = getMapsProvider();
  let position = { lat: input.latitude ?? 0, lng: input.longitude ?? 0 };
  let pinnedManually = input.latitude !== undefined && input.longitude !== undefined;

  if (!pinnedManually) {
    const geocoded = await maps.geocode(
      `${input.line1}, ${input.landmark}, ${input.pincode}`,
      input.city,
    );
    if (!geocoded) {
      return {
        ok: false,
        reason: 'We could not find that address on the map.',
        remedy:
          'Add a landmark, or drop a pin on the map so the technician knows exactly which door to knock on.',
      };
    }
    position = geocoded.position;
    pinnedManually = false;
  }

  const zones = await db.zone.findMany({ where: { isActive: true } });
  const boundaries: ZoneBoundary[] = zones.map((z) => ({
    id: z.id,
    name: z.name,
    centerLat: z.centerLat,
    centerLng: z.centerLng,
    radiusKm: z.radiusKm,
    polygon: z.polygonJson ? (JSON.parse(z.polygonJson) as { lat: number; lng: number }[]) : null,
    isActive: z.isActive,
  }));

  const check = evaluateRadius(position, boundaries);

  if (isRefusal(check.decision)) {
    // Capture the demand instead of discarding it. This list is the evidence
    // that later justifies opening zone two.
    await db.waitlistEntry.create({
      data: {
        zoneId: zones[0]?.id ?? null,
        callerName: user.name,
        callerPhone: user.phone,
        patientName: input.name,
        patientAge: input.ageYears,
        addressText: `${input.line1}, ${input.landmark}, ${input.city} ${input.pincode}`,
        latitude: position.lat,
        longitude: position.lng,
        distanceKm: check.distanceKm,
        note: 'Added from the caregiver app; address outside the service radius.',
      },
    });

    await audit({
      action: 'WAITLISTED_OUT_OF_ZONE',
      entityType: 'WaitlistEntry',
      entityId: user.id,
      actorUserId: user.id,
      actorRole: 'CAREGIVER',
      detail: { distanceKm: check.distanceKm, patientName: input.name },
    });

    return {
      ok: false,
      waitlisted: true,
      distanceKm: check.distanceKm,
      reason: check.decision.reason,
      remedy:
        'We have added you to the waitlist and will call the moment we open a zone near you. We would rather tell you that than promise a service we cannot keep well.',
    };
  }

  const patient = await db.patient.create({
    data: {
      familyId: membership.familyId,
      name: input.name,
      ageYears: input.ageYears,
      ageBand: ageBandFor(input.ageYears),
      sex: input.sex,
      conditions: input.conditions,
      medications: input.medications,
      mobility: input.mobility,
      careNotes: input.careNotes,
      needsProxyConsent: input.needsProxyConsent,
      addresses: {
        create: {
          line1: input.line1,
          landmark: input.landmark,
          city: input.city,
          state: input.state,
          pincode: input.pincode,
          latitude: position.lat,
          longitude: position.lng,
          pinnedManually,
          zoneId: check.zone?.id ?? null,
        },
      },
    },
  });

  await audit({
    action: 'BOOKING_CREATED',
    entityType: 'Patient',
    entityId: patient.id,
    actorUserId: user.id,
    actorRole: 'CAREGIVER',
    detail: { event: 'patient_added', zoneId: check.zone?.id, distanceKm: check.distanceKm },
  });

  revalidatePath('/caregiver');
  redirect(`/caregiver/plan?patient=${patient.id}`);
}

// --- booking a visit ---------------------------------------------------------

const bookVisitSchema = z.object({
  patientId: z.string().min(1),
  panelId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  windowStartHour: z.coerce.number().min(6).max(10),
});

/**
 * Booking runs the routing gate before it writes anything: the lab must be
 * ACTIVE, its accreditation current, its accredited scope must cover every
 * discipline in the order, and it must be under its capacity ceiling.
 */
export async function bookVisit(
  _prev: CaregiverActionState,
  formData: FormData,
): Promise<CaregiverActionState> {
  const user = await requireRole('CAREGIVER');

  const parsed = bookVisitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: 'Please choose a panel, a date and a time.' };

  const patient = await db.patient.findFirst({
    where: { id: parsed.data.patientId, family: { members: { some: { userId: user.id } } } },
    include: {
      addresses: { where: { isPrimary: true }, take: 1 },
      subscriptions: { where: { status: 'ACTIVE' }, take: 1 },
      family: true,
    },
  });
  if (!patient) return { ok: false, message: 'We could not find that patient.' };

  const address = patient.addresses[0];
  if (!address?.zoneId) {
    return {
      ok: false,
      reason: 'This address is not inside an active service zone.',
      remedy: 'Contact us and we will add you to the waitlist for the next zone.',
    };
  }

  const [panel, zone] = await Promise.all([
    db.panel.findUnique({
      where: { id: parsed.data.panelId },
      include: { items: { include: { test: true } } },
    }),
    db.zone.findUnique({ where: { id: address.zoneId }, include: { anchorLab: true } }),
  ]);

  if (!panel || !zone?.anchorLabId) {
    return { ok: false, message: 'That panel or zone is not available.' };
  }

  const startOfDay = new Date(`${parsed.data.date}T00:00:00`);
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);

  const lab = await db.lab.findUnique({
    where: { id: zone.anchorLabId },
    include: { accreditation: true },
  });
  if (!lab) return { ok: false, message: 'The zone has no anchor laboratory.' };

  const todayVolume = await db.booking.count({
    where: { labId: lab.id, windowStart: { gte: startOfDay, lt: endOfDay } },
  });

  const routing = evaluateRouting(
    {
      id: lab.id,
      name: lab.name,
      status: lab.status,
      capacityCeiling: lab.capacityCeiling,
      todayVolume,
      accreditation: lab.accreditation
        ? {
            certificateNumber: lab.accreditation.certificateNumber,
            scope: lab.accreditation.scope,
            validUntil: lab.accreditation.validUntil,
          }
        : null,
    },
    panel.items.map((i) => ({
      code: i.test.code,
      name: i.test.name,
      discipline: i.test.discipline,
    })),
  );

  if (isRefusal(routing)) {
    await audit({
      action: 'LAB_ROUTING_REFUSED',
      entityType: 'Lab',
      entityId: lab.id,
      actorUserId: user.id,
      actorRole: 'CAREGIVER',
      detail: { reason: routing.reason, panel: panel.code },
    });
    return { ok: false, reason: routing.reason, remedy: routing.remedy };
  }

  const windowStart = new Date(startOfDay);
  windowStart.setHours(parsed.data.windowStartHour, 30, 0, 0);
  const windowEnd = new Date(
    windowStart.getTime() +
      (VISIT_MINUTES_BY_MOBILITY[patient.mobility] ?? 20) * 60_000 +
      40 * 60_000,
  );

  const { bookingReference } = await import('@/lib/compliance/crypto');
  const { CHECKLIST_STEPS } = await import('@/lib/enums');

  const booking = await db.booking.create({
    data: {
      reference: bookingReference(),
      familyId: patient.familyId,
      patientId: patient.id,
      addressId: address.id,
      subscriptionId: patient.subscriptions[0]?.id ?? null,
      zoneId: zone.id,
      labId: lab.id,
      technicianId: patient.subscriptions[0]?.assignedTechnicianId ?? null,
      status: 'SCHEDULED',
      intakeChannel: 'APP',
      windowStart,
      windowEnd,
      fastingRequired: panel.fastingHours > 0,
      fastingHours: panel.fastingHours,
      totalPaise: patient.subscriptions[0] ? 0 : panel.pricePaise,
      items: {
        create: [
          { panelId: panel.id, pricePaise: patient.subscriptions[0] ? 0 : panel.pricePaise },
        ],
      },
      checklistSteps: {
        create: CHECKLIST_STEPS.map((step) => ({
          stepKey: step.key,
          sequence: step.sequence,
          isBlocking: step.blocking,
          completedAt: step.sequence === 1 ? new Date() : null,
        })),
      },
    },
  });

  await audit({
    action: 'BOOKING_CREATED',
    entityType: 'Booking',
    entityId: booking.id,
    actorUserId: user.id,
    actorRole: 'CAREGIVER',
    detail: { reference: booking.reference, labId: lab.id, panel: panel.code },
  });

  revalidatePath('/caregiver');
  return { ok: true, message: `Booked. Reference ${booking.reference}.` };
}

// --- live tracking link ------------------------------------------------------

/**
 * A tracking link is a signed, single-visit token that dies with the visit —
 * never a permanent URL. Continuous GPS of a health worker entering identified
 * patients' homes is a liability, not a feature, so the exposure is bounded by
 * construction.
 */
export async function issueTrackingLink(bookingId: string): Promise<string | null> {
  const user = await requireRole('CAREGIVER');

  const booking = await db.booking.findFirst({
    where: { id: bookingId, family: { members: { some: { userId: user.id } } } },
  });
  if (!booking) return null;

  const { randomToken, hashToken } = await import('@/lib/compliance/crypto');
  const token = randomToken(24);

  await db.trackingSession.create({
    data: {
      bookingId: booking.id,
      tokenHash: hashToken(token),
      // Thirty minutes past the promised window, and not a minute more.
      expiresAt: new Date(booking.windowEnd.getTime() + 30 * 60_000),
    },
  });

  return token;
}

/** Route geometry for the caregiver's map. */
export async function loadRouteGeometry(bookingId: string) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { route: true },
  });
  if (!booking?.route?.encodedPolyline) return [];
  return decodePolyline(booking.route.encodedPolyline);
}
