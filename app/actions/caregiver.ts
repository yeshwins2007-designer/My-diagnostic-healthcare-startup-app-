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
import { isRefusal, refuse } from '@/lib/sop/types';
import { getMapsProvider } from '@/lib/providers/maps';
import { quote } from '@/lib/pricing';
import { loadMembership, membershipTerms } from '@/lib/queries/catalog';

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
  redirect(`/caregiver/book?patient=${patient.id}`);
}

// --- booking a visit ---------------------------------------------------------

const createBookingSchema = z.object({
  patientId: z.string().min(1),
  /** One or more "panel:<id>" / "test:<id>" keys, comma separated. */
  items: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  windowStartHour: z.coerce.number().min(6).max(10),
});

/**
 * A family books what the laboratory offers - a package, single tests, or
 * both - and pays for it before the visit is confirmed.
 *
 * Booking runs the routing gate before it writes anything: the lab must be
 * ACTIVE, its accreditation current, its accredited scope must cover every
 * discipline in the order, and it must be under its capacity ceiling. The
 * price comes from lib/pricing, the same function every screen shows, and is
 * written onto the booking so the checkout charges exactly what was quoted.
 *
 * The booking is held as AWAITING_PAYMENT, which takes no route or lab
 * capacity, and the family is sent to the checkout.
 */
export async function createBooking(
  _prev: CaregiverActionState,
  formData: FormData,
): Promise<CaregiverActionState> {
  const user = await requireRole('CAREGIVER');

  const parsed = createBookingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: 'Please choose at least one test, a date and a time.' };
  }

  const patient = await db.patient.findFirst({
    where: { id: parsed.data.patientId, family: { members: { some: { userId: user.id } } } },
    include: { addresses: { where: { isPrimary: true }, take: 1 } },
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

  const keys = [...new Set(parsed.data.items.split(',').map((k) => k.trim()).filter(Boolean))];
  const panelIds = keys.filter((k) => k.startsWith('panel:')).map((k) => k.slice(6));
  const testIds = keys.filter((k) => k.startsWith('test:')).map((k) => k.slice(5));

  const [panels, singleTests, zone, membership] = await Promise.all([
    db.panel.findMany({
      where: { id: { in: panelIds }, isActive: true },
      include: { items: { include: { test: true } } },
    }),
    db.testDefinition.findMany({ where: { id: { in: testIds }, isActive: true } }),
    db.zone.findUnique({ where: { id: address.zoneId } }),
    loadMembership(patient.familyId),
  ]);

  if (panels.length + singleTests.length === 0 || panels.length + singleTests.length !== keys.length) {
    return { ok: false, message: 'One of those tests is no longer offered. Please choose again.' };
  }
  if (!zone?.anchorLabId) return { ok: false, message: 'That zone has no laboratory yet.' };

  // Every distinct test the lab has to run, for the accreditation-scope check.
  const allTests = [
    ...new Map(
      [...panels.flatMap((p) => p.items.map((i) => i.test)), ...singleTests].map((t) => [t.id, t]),
    ).values(),
  ];
  const routingTests = allTests.map((t) => ({ code: t.code, name: t.name, discipline: t.discipline }));
  const orderLabel = [...panels.map((p) => p.code), ...singleTests.map((t) => t.code)].join('+');

  const startOfDay = new Date(`${parsed.data.date}T00:00:00`);
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);
  const volumeOn = (labId: string) =>
    db.booking.count({
      where: {
        labId,
        windowStart: { gte: startOfDay, lt: endOfDay },
        status: { notIn: ['AWAITING_PAYMENT', 'CANCELLED'] },
      },
    });
  const routable = async (labId: string) => {
    const lab = await db.lab.findUnique({ where: { id: labId }, include: { accreditation: true } });
    if (!lab) return null;
    const check = evaluateRouting(
      {
        id: lab.id,
        name: lab.name,
        status: lab.status,
        capacityCeiling: lab.capacityCeiling,
        todayVolume: await volumeOn(lab.id),
        accreditation: lab.accreditation
          ? {
              certificateNumber: lab.accreditation.certificateNumber,
              scope: lab.accreditation.scope,
              validUntil: lab.accreditation.validUntil,
            }
          : null,
      },
      routingTests,
    );
    // A test the lab has paused (analyser down, reagent out) cannot go there.
    if (!isRefusal(check)) {
      const paused = await db.labRateCardEntry.findFirst({
        where: { labId: lab.id, testId: { in: allTests.map((t) => t.id) }, isPaused: true },
        include: { test: true },
      });
      if (paused) {
        return {
          lab,
          check: refuse(
            `${lab.name} has paused ${paused.test.name} for now${paused.pausedReason ? ` (${paused.pausedReason})` : ''}.`,
            'Choose another laboratory in Profile, or book this test again later.',
            { labId: lab.id, pausedTest: paused.test.code },
          ),
        };
      }
    }
    return { lab, check };
  };

  /**
   * The family's chosen lab wins while it can still do the work. A preference
   * recorded weeks ago can go stale, so it is checked first and falls back to
   * the zone's anchor if it no longer passes, with the substitution audited.
   */
  let routed = null as Awaited<ReturnType<typeof routable>>;
  if (patient.preferredLabId && patient.preferredLabId !== zone.anchorLabId) {
    const preferred = await routable(patient.preferredLabId);
    if (preferred && isRefusal(preferred.check)) {
      await audit({
        action: 'LAB_ROUTING_REFUSED',
        entityType: 'Lab',
        entityId: preferred.lab.id,
        actorUserId: user.id,
        actorRole: 'CAREGIVER',
        detail: { reason: preferred.check.reason, order: orderLabel, fellBackTo: zone.anchorLabId, wasPreferred: true },
      });
    } else if (preferred) {
      routed = preferred;
    }
  }
  routed ??= await routable(zone.anchorLabId);
  if (!routed) return { ok: false, message: 'The zone has no anchor laboratory.' };
  if (isRefusal(routed.check)) {
    await audit({
      action: 'LAB_ROUTING_REFUSED',
      entityType: 'Lab',
      entityId: routed.lab.id,
      actorUserId: user.id,
      actorRole: 'CAREGIVER',
      detail: { reason: routed.check.reason, order: orderLabel },
    });
    return { ok: false, reason: routed.check.reason, remedy: routed.check.remedy };
  }
  const lab = routed.lab;

  // Continuity: a member's assigned technician, else whoever came last time.
  const previous = await db.booking.findFirst({
    where: { patientId: patient.id, technicianId: { not: null } },
    orderBy: { windowStart: 'desc' },
    select: { technicianId: true },
  });
  const fallbackTech = await db.technician.findFirst({
    where: { zoneId: zone.id, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  const technicianId =
    membership?.assignedTechnicianId ?? previous?.technicianId ?? fallbackTech?.id ?? null;

  const items = [
    ...panels.map((p) => ({ panelId: p.id, pricePaise: p.pricePaise })),
    ...singleTests.map((t) => ({ testId: t.id, pricePaise: t.pricePaise })),
  ];
  const price = quote(items, membershipTerms(membership));
  const fastingHours = Math.max(0, ...panels.map((p) => p.fastingHours), ...singleTests.map((t) => t.fastingHours));

  const windowStart = new Date(startOfDay);
  windowStart.setHours(parsed.data.windowStartHour, 30, 0, 0);
  if (windowStart.getTime() < Date.now()) {
    return { ok: false, message: 'That time has already passed. Please choose a later morning.' };
  }
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
      subscriptionId: membership?.id ?? null,
      zoneId: zone.id,
      labId: lab.id,
      technicianId,
      status: 'AWAITING_PAYMENT',
      intakeChannel: 'APP',
      windowStart,
      windowEnd,
      fastingRequired: fastingHours > 0,
      fastingHours,
      subtotalPaise: price.subtotalPaise,
      discountPaise: price.discountPaise,
      collectionFeePaise: price.collectionFeePaise,
      totalPaise: price.totalPaise,
      items: { create: items },
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
    detail: { reference: booking.reference, labId: lab.id, order: orderLabel, totalPaise: price.totalPaise },
  });

  revalidatePath('/caregiver');
  redirect(`/caregiver/checkout/${booking.id}`);
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
/**
 * The laboratories this patient's family may choose between.
 *
 * Candidates are every ACTIVE lab, ranked by distance from the patient's own
 * door and put through the same evaluateRouting the booking uses. Ineligible
 * labs come back too, carrying their reason, so the screen can say why the
 * lab around the corner is not on offer instead of quietly omitting it.
 */
export async function labChoicesForPatient(patientId: string, panelId?: string) {
  const user = await requireRole('CAREGIVER');

  const patient = await db.patient.findFirst({
    // Scoped through the family membership: a caregiver must never enumerate
    // labs — or anything else — for a patient who is not theirs.
    where: { id: patientId, family: { members: { some: { userId: user.id } } } },
    include: { addresses: { take: 1 }, family: true },
  });
  if (!patient) return { ok: false as const, message: 'Patient not found.' };

  const address = patient.addresses[0];
  const zone = address?.zoneId
    ? await db.zone.findUnique({ where: { id: address.zoneId } })
    : null;

  const panel = panelId
    ? await db.panel.findUnique({
        where: { id: panelId },
        include: { items: { include: { test: true } } },
      })
    : await db.panel.findFirst({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: { items: { include: { test: true } } },
      });
  if (!panel) return { ok: false as const, message: 'No panel available.' };

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const labs = await db.lab.findMany({
    where: { status: 'ACTIVE' },
    include: { accreditation: true },
  });

  const volumes = await db.booking.groupBy({
    by: ['labId'],
    where: { windowStart: { gte: startOfDay } },
    _count: { _all: true },
  });
  const volumeFor = new Map(volumes.map((v) => [v.labId, v._count._all]));

  const { rankLabChoices } = await import('@/lib/sop/labRouting');
  const { haversineKm } = await import('@/lib/geo');

  const choices = rankLabChoices(
    labs.map((l) => ({
      id: l.id,
      name: l.name,
      status: l.status,
      capacityCeiling: l.capacityCeiling,
      todayVolume: volumeFor.get(l.id) ?? 0,
      latitude: l.latitude,
      longitude: l.longitude,
      accreditation: l.accreditation
        ? {
            certificateNumber: l.accreditation.certificateNumber,
            scope: l.accreditation.scope,
            validUntil: l.accreditation.validUntil,
          }
        : null,
    })),
    panel.items.map((i) => ({
      code: i.test.code,
      name: i.test.name,
      discipline: i.test.discipline,
    })),
    {
      from:
        address && address.latitude != null && address.longitude != null
          ? { lat: address.latitude, lng: address.longitude }
          : null,
      zoneAnchorLabId: zone?.anchorLabId ?? null,
      distanceKm: haversineKm,
    },
  );

  return {
    ok: true as const,
    panelName: panel.name,
    selectedLabId: patient.preferredLabId,
    choices,
  };
}

/**
 * Record — or clear — the family's preferred laboratory.
 *
 * The chosen lab is re-validated here rather than trusted from the form: the
 * list the browser rendered may be minutes old, and a lab can fall out of
 * eligibility between render and submit. Passing an empty id clears the
 * preference and returns the patient to the zone's anchor lab.
 */
export async function setPreferredLab(
  patientId: string,
  labId: string,
): Promise<{ ok: boolean; message?: string; reason?: string; remedy?: string }> {
  const user = await requireRole('CAREGIVER');

  const patient = await db.patient.findFirst({
    where: { id: patientId, family: { members: { some: { userId: user.id } } } },
  });
  if (!patient) return { ok: false, message: 'Patient not found.' };

  if (!labId) {
    await db.patient.update({ where: { id: patient.id }, data: { preferredLabId: null } });
    await audit({
      action: 'LAB_PREFERENCE_CLEARED',
      entityType: 'Patient',
      entityId: patient.id,
      actorUserId: user.id,
      actorRole: 'CAREGIVER',
      detail: {},
    });
    revalidatePath('/caregiver');
    return { ok: true, message: 'We will use the laboratory assigned to your area.' };
  }

  const available = await labChoicesForPatient(patientId);
  if (!available.ok) return { ok: false, message: available.message };

  const chosen = available.choices.find((c) => c.id === labId);
  if (!chosen) return { ok: false, message: 'That laboratory is not available.' };
  if (!chosen.eligible) {
    return {
      ok: false,
      reason: chosen.reason ?? `${chosen.name} cannot process this panel.`,
      remedy:
        'Choose a laboratory accredited for every test in the panel. A result produced outside a laboratory’s accredited scope is not a valid result.',
    };
  }

  await db.patient.update({ where: { id: patient.id }, data: { preferredLabId: labId } });
  await audit({
    action: 'LAB_PREFERENCE_SET',
    entityType: 'Patient',
    entityId: patient.id,
    actorUserId: user.id,
    actorRole: 'CAREGIVER',
    detail: { labId, labName: chosen.name },
  });
  revalidatePath('/caregiver');
  return { ok: true, message: `Samples will be sent to ${chosen.name}.` };
}
