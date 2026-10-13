'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import { audit } from '@/lib/compliance/audit';
import { encryptField } from '@/lib/compliance/crypto';
import { validateCertificateNumber } from '@/lib/sop/labRouting';
import { isRefusal } from '@/lib/sop/types';
import { dueBy } from '@/lib/sop/followUp';
import { Discipline } from '@/lib/enums';
import { parseResultValues, testsOfOrder } from '@/lib/orders/results';
import { acceptOrder, rejectOrder, REJECT_REASONS } from '@/lib/orders/lab-orders';
import { getMapsProvider } from '@/lib/providers/maps';
import { publishReportToAbha } from './abha';

export interface LabActionState {
  ok: boolean;
  message?: string;
  reason?: string;
  remedy?: string;
}

const applicationSchema = z.object({
  name: z.string().min(2).max(160),
  legalName: z.string().min(2).max(200),
  contactName: z.string().min(2).max(120),
  contactPhone: z.string().min(10).max(15),
  contactEmail: z.string().email(),
  website: z.string().max(120).optional(),
  addressLine: z.string().min(5).max(300),
  city: z.string().min(2).max(80),
  state: z.string().min(2).max(80),
  pincode: z.string().regex(/^\d{6}$/),
  certificateNumber: z.string().min(4).max(20),
  scope: z.string().min(3),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hfrFacilityId: z.string().max(40).optional(),
  supervisingPathologistName: z.string().min(2).max(160),
  supervisingPathologistReg: z.string().min(3).max(60),
  capacityCeiling: z.coerce.number().int().min(1).max(1000),
  abdmMode: z.enum(['LAB_SELF', 'PLATFORM_FACILITATED', 'NONE']),
  brandingConsent: z.coerce.boolean(),
});

/**
 * A laboratory application.
 *
 * Submitting does not make a lab routable. It creates a record for a human to
 * verify against the NABL public directory. The certificate format is checked
 * here so a testing-and-calibration number is rejected with an explanation
 * rather than sitting in a queue for a week before someone notices.
 */
export async function submitLabApplication(
  _prev: LabActionState,
  formData: FormData,
): Promise<LabActionState> {
  const user = await requireRole('LAB');

  const parsed = applicationSchema.safeParse({
    ...Object.fromEntries(formData),
    brandingConsent: formData.get('brandingConsent') === 'on',
    scope: formData.getAll('scope').join(','),
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }
  const input = parsed.data;

  const certificate = validateCertificateNumber(input.certificateNumber);
  if (isRefusal(certificate)) {
    return { ok: false, reason: certificate.reason, remedy: certificate.remedy };
  }

  const validUntil = new Date(`${input.validUntil}T00:00:00`);
  if (validUntil <= new Date()) {
    return {
      ok: false,
      reason: 'That accreditation has already expired.',
      remedy: 'Apply again with the renewed certificate. We cannot route samples on a lapsed accreditation.',
    };
  }

  const disciplines = input.scope
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => (Discipline.values as readonly string[]).includes(s));

  if (disciplines.length === 0) {
    return {
      ok: false,
      reason: 'No accredited disciplines were selected.',
      remedy:
        'Tick every discipline on your certificate. We match each test we route against this list, so an incomplete scope means we route you less work, not more.',
    };
  }

  const existing = await db.lab.findFirst({
    where: { accreditation: { certificateNumber: input.certificateNumber.toUpperCase() } },
  });
  if (existing) {
    return {
      ok: false,
      reason: `Certificate ${input.certificateNumber.toUpperCase()} is already registered.`,
      remedy: 'If this is your laboratory, contact us and we will add you to the existing account.',
    };
  }

  const geocoded = await getMapsProvider().geocode(
    `${input.addressLine}, ${input.pincode}`,
    input.city,
  );

  const lab = await db.lab.create({
    data: {
      name: input.name,
      legalName: input.legalName,
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail,
      // Only a well-formed domain is kept: it is used to fetch the lab's logo.
      website: /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domainOf(input.website ?? '')) ? domainOf(input.website ?? '') : '',
      addressLine: input.addressLine,
      city: input.city,
      state: input.state,
      pincode: input.pincode,
      latitude: geocoded?.position.lat ?? 0,
      longitude: geocoded?.position.lng ?? 0,
      status: 'SUBMITTED',
      capacityCeiling: input.capacityCeiling,
      abdmMode: input.abdmMode,
      brandingConsent: input.brandingConsent,
      submittedAt: new Date(),
      members: { create: [{ userId: user.id, role: 'OWNER' }] },
      accreditation: {
        create: {
          certificateNumber: input.certificateNumber.toUpperCase(),
          scope: disciplines.join(','),
          validFrom: new Date(`${input.validFrom}T00:00:00`),
          validUntil,
          hfrFacilityId: input.hfrFacilityId || null,
          supervisingPathologistName: input.supervisingPathologistName,
          supervisingPathologistReg: input.supervisingPathologistReg,
          verificationState: 'NOT_STARTED',
        },
      },
    },
  });

  await audit({
    action: 'LAB_SUBMITTED',
    entityType: 'Lab',
    entityId: lab.id,
    actorUserId: user.id,
    actorRole: 'LAB',
    detail: { certificateNumber: input.certificateNumber.toUpperCase(), scope: disciplines },
  });

  revalidatePath('/lab');
  redirect('/lab?submitted=1');
}

// --- who may act ----------------------------------------------------------------

type LabContext =
  | { ok: true; user: Awaited<ReturnType<typeof requireRole>>; membership: { labId: string; role: string; lab: { status: string; name: string } } }
  | { ok: false; message: string };

/**
 * Every lab action starts here: a LAB session, a membership, and (for
 * anything that touches samples or orders) an ACTIVE lab. A suspended lab's
 * open tab must not keep signing reports. `roles` narrows who may act:
 * signing results and turning orders down are for owners and managers, not
 * the intake desk.
 */
async function labContext(opts: { active?: boolean; roles?: string[] } = {}): Promise<LabContext> {
  const user = await requireRole('LAB');
  const membership = await db.labMember.findFirst({
    where: { userId: user.id },
    include: { lab: { select: { status: true, name: true } } },
  });
  if (!membership) return { ok: false, message: 'No laboratory is linked to this account.' };
  if (opts.active && membership.lab.status !== 'ACTIVE') {
    return { ok: false, message: `${membership.lab.name} is not active, so it cannot handle samples or orders right now.` };
  }
  if (opts.roles && !opts.roles.includes(membership.role)) {
    return { ok: false, message: 'Only an owner or a manager of the laboratory can do this.' };
  }
  return { ok: true, user, membership };
}

const SIGNERS = ['OWNER', 'MANAGER'];

// --- orders ------------------------------------------------------------------------

export async function acceptLabOrder(bookingId: string): Promise<LabActionState> {
  const ctx = await labContext({ active: true });
  if (!ctx.ok) return ctx;
  const result = await acceptOrder({ bookingId, labId: ctx.membership.labId, userId: ctx.user.id });
  revalidatePath('/lab');
  return result;
}

export async function rejectLabOrder(_prev: LabActionState, formData: FormData): Promise<LabActionState> {
  const ctx = await labContext({ active: true, roles: SIGNERS });
  if (!ctx.ok) return ctx;
  const reason = String(formData.get('reason') ?? '');
  const note = String(formData.get('note') ?? '').trim();
  if (!(REJECT_REASONS as readonly string[]).includes(reason)) {
    return { ok: false, message: 'Choose a reason for rejecting the order.' };
  }
  if (reason === 'Other' && note.length < 5) {
    return { ok: false, message: 'Say briefly why, so our team can follow up.' };
  }
  const result = await rejectOrder({
    bookingId: String(formData.get('bookingId') ?? ''),
    labId: ctx.membership.labId,
    userId: ctx.user.id,
    reason: note ? `${reason}: ${note}` : reason,
  });
  revalidatePath('/lab');
  return result;
}

// --- intake ------------------------------------------------------------------

/**
 * Accepting a sample for processing at the intake desk. Only a sample whose
 * handover the technician has recorded (RECEIVED) can be accepted: that is
 * the chain-of-custody step and the two-hour clock check, and skipping it
 * used to leave the clock running forever.
 */
export async function receiveSpecimen(barcode: string): Promise<LabActionState> {
  const ctx = await labContext({ active: true });
  if (!ctx.ok) return ctx;

  // Scoped to this lab's own bookings: a barcode alone must not let one lab
  // move another lab's sample through the pipeline.
  const code = barcode.trim().toUpperCase();
  const specimen = await db.specimen.findFirst({
    where: { barcode: code, booking: { labId: ctx.membership.labId } },
    include: { booking: true },
  });
  if (!specimen) return { ok: false, message: `No specimen with barcode ${code} for your laboratory.` };
  if (specimen.status === 'COLLECTED' || specimen.status === 'IN_TRANSIT') {
    return {
      ok: false,
      message: `${code} has not been handed over yet. Ask the technician to record the handover in their app, then scan it again.`,
    };
  }
  if (specimen.status !== 'RECEIVED') {
    return { ok: false, message: `${code} is ${specimen.status.toLowerCase()} and cannot be accepted again.` };
  }

  await db.specimen.update({
    where: { id: specimen.id },
    data: { status: 'PROCESSED', intakeAt: specimen.intakeAt ?? new Date() },
  });
  await db.booking.updateMany({
    where: { id: specimen.bookingId, status: { in: ['AT_LAB', 'IN_TRANSIT', 'COLLECTED'] } },
    data: { status: 'PROCESSING' },
  });

  revalidatePath('/lab');
  return { ok: true, message: `${specimen.barcode} accepted for processing.` };
}

/** Rejecting a sample, by the barcode printed on it. */
export async function rejectSpecimen(
  _prev: LabActionState,
  formData: FormData,
): Promise<LabActionState> {
  const ctx = await labContext({ active: true });
  if (!ctx.ok) return ctx;
  const code = String(formData.get('barcode') ?? formData.get('specimenId') ?? '').trim().toUpperCase();
  const reason = String(formData.get('reason') ?? '').trim();

  if (reason.length < 5) {
    return { ok: false, message: 'Give the reason for rejecting the sample.' };
  }

  // Only this lab's own samples: a rejection triggers a recollection visit
  // and a critical incident, so it must not be callable on another lab's.
  const owned = await db.specimen.findFirst({
    where: { OR: [{ barcode: code }, { id: code }], booking: { labId: ctx.membership.labId } },
    include: { booking: { select: { status: true } } },
  });
  if (!owned) return { ok: false, message: `No sample ${code} is with your laboratory.` };
  if (!['RECEIVED', 'PROCESSED'].includes(owned.status) || ['REPORTED', 'CLOSED'].includes(owned.booking.status)) {
    return { ok: false, message: `${owned.barcode} cannot be rejected now: it is ${owned.status.toLowerCase()} and its order is ${owned.booking.status.toLowerCase()}.` };
  }

  const specimen = await db.specimen.update({
    where: { id: owned.id },
    data: { status: 'REJECTED', rejectionReason: reason },
  });

  // Every rejection is a free repeat within 24 hours plus a founder call. No
  // exceptions, and no argument about whose fault it was.
  await db.booking.update({
    where: { id: specimen.bookingId },
    data: { status: 'RECOLLECTION_REQUIRED' },
  });

  await db.incident.create({
    data: {
      bookingId: specimen.bookingId,
      tier: 'TIER_1_CRITICAL',
      kind: 'SAMPLE_DEGRADED',
      summary: `Sample ${specimen.barcode} rejected: ${reason}`,
    },
  });

  await audit({
    action: 'SPECIMEN_REJECTED',
    entityType: 'Specimen',
    entityId: specimen.id,
    actorUserId: ctx.user.id,
    actorRole: 'LAB',
    detail: { reason },
  });

  revalidatePath('/lab');
  return {
    ok: true,
    message:
      'Recorded. A free recollection within 24 hours and a founder call have been raised automatically.',
  };
}

// --- results -----------------------------------------------------------------

const resultSchema = z.object({
  bookingId: z.string().min(1),
  pathologistName: z.string().trim().min(2),
  pathologistReg: z.string().trim().min(3),
  values: z.string().trim().min(2),
});

/**
 * Uploading results.
 *
 * The report is created as SUMMARY_PENDING_REVIEW, not RELEASED. Nothing
 * reaches a family until a human at MEDWYN has verified that the structure of
 * the report matches the physical patient identifiers — and that gate is
 * permanent, not an early-stage precaution.
 *
 * Every test in the order, panel or single, must have a value, and nothing
 * is stored unless all of them parse (lib/orders/results.ts). One report per
 * order: the order is claimed (PROCESSING to REPORTED) before the report is
 * written, so a double submit cannot create two.
 */
export async function uploadResults(
  _prev: LabActionState,
  formData: FormData,
): Promise<LabActionState> {
  const ctx = await labContext({ active: true, roles: SIGNERS });
  if (!ctx.ok) return ctx;

  const parsed = resultSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: 'Please fill in the values and the signing details.' };

  const booking = await db.booking.findFirst({
    where: { id: parsed.data.bookingId, labId: ctx.membership.labId },
    include: {
      items: { include: { test: true, panel: { include: { items: { include: { test: true } } } } } },
    },
  });
  if (!booking) return { ok: false, message: 'That booking is not routed to your laboratory.' };
  if (booking.status !== 'PROCESSING') {
    return { ok: false, message: `Results can be entered only for an order being processed; ${booking.reference} is ${booking.status.toLowerCase()}.` };
  }

  const tests = testsOfOrder(booking.items);
  const result = parseResultValues(parsed.data.values, tests);
  if (!result.ok) {
    return { ok: false, reason: 'Nothing was saved.', remedy: result.errors.join(' ') };
  }

  const claimed = await db.booking.updateMany({
    where: { id: booking.id, status: 'PROCESSING' },
    data: { status: 'REPORTED' },
  });
  if (claimed.count === 0) return { ok: false, message: 'These results were just submitted from another screen.' };

  const now = new Date();
  const report = await db.report.create({
    data: {
      bookingId: booking.id,
      patientId: booking.patientId,
      labId: ctx.membership.labId,
      // Signed, not released. The human verification gate is next.
      status: 'SUMMARY_PENDING_REVIEW',
      overallBand: result.overall,
      pathologistName: parsed.data.pathologistName,
      pathologistReg: parsed.data.pathologistReg,
      signedAt: now,
      parameters: {
        create: result.parameters.map((p) => ({
          testId: p.testId,
          valueEncrypted: encryptField(p.value),
          unit: p.unit,
          refLow: p.refLow,
          refHigh: p.refHigh,
          band: p.band,
          isCritical: p.isCritical,
        })),
      },
    },
  });
  // Step 9 of the visit checklist is the lab's, and this is it.
  await db.visitChecklistStep.updateMany({
    where: { bookingId: booking.id, stepKey: 'LAB_PROCESSED_AND_SIGNED', completedAt: null },
    data: { completedAt: now },
  });

  await audit({
    action: 'REPORT_SIGNED',
    entityType: 'Report',
    entityId: report.id,
    actorUserId: ctx.user.id,
    actorRole: 'LAB',
    detail: {
      pathologist: parsed.data.pathologistName,
      parameterCount: result.parameters.length,
      overallBand: result.overall,
    },
  });

  revalidatePath('/lab');
  return {
    ok: true,
    message: `Report signed. It will reach the family once a MEDWYN coordinator has verified the identifiers.${result.overall === 'RED' ? ' A critical value has been flagged and will be called immediately.' : ''}`,
  };
}

// --- catalogue and profile -----------------------------------------------------

/**
 * Pausing a test the lab cannot run today (analyser down, reagent out). A
 * paused test is not routed to this lab and is not offered to families whose
 * lab this is, until resumed. Prices are not the lab's to change alone: they
 * are in the signed agreement, so a change is a request (below).
 */
export async function setTestPaused(testId: string, paused: boolean, reason = ''): Promise<LabActionState> {
  const ctx = await labContext({ roles: SIGNERS });
  if (!ctx.ok) return ctx;
  const entry = await db.labRateCardEntry.findFirst({ where: { labId: ctx.membership.labId, testId }, include: { test: true } });
  if (!entry) return { ok: false, message: 'That test is not on your rate card.' };
  if (paused && reason.trim().length < 3) return { ok: false, message: 'Say why the test is paused, for example “analyser under service”.' };
  await db.labRateCardEntry.update({
    where: { id: entry.id },
    data: { isPaused: paused, pausedReason: paused ? reason.trim() : '' },
  });
  await audit({
    action: paused ? 'LAB_TEST_PAUSED' : 'LAB_TEST_RESUMED',
    entityType: 'Lab',
    entityId: ctx.membership.labId,
    actorUserId: ctx.user.id,
    actorRole: 'LAB',
    detail: { test: entry.test.code, reason: reason.trim() },
  });
  revalidatePath('/lab/catalog');
  return { ok: true, message: `${entry.test.name} ${paused ? 'paused' : 'resumed'}.` };
}

export async function requestRateChange(_prev: LabActionState, formData: FormData): Promise<LabActionState> {
  const ctx = await labContext({ roles: SIGNERS });
  if (!ctx.ok) return ctx;
  const testId = String(formData.get('testId') ?? '');
  const rupees = Number(formData.get('rupees'));
  const why = String(formData.get('why') ?? '').trim();
  const entry = await db.labRateCardEntry.findFirst({ where: { labId: ctx.membership.labId, testId }, include: { test: true } });
  if (!entry) return { ok: false, message: 'Choose a test from your rate card.' };
  if (!Number.isInteger(rupees) || rupees < 1 || rupees > 100_000) return { ok: false, message: 'Enter the new rate in whole rupees.' };
  if (why.length < 10) return { ok: false, message: 'Explain the change in a sentence or two.' };
  await db.supportTicket.create({
    data: {
      raisedByUserId: ctx.user.id,
      source: 'APP',
      category: 'LAB_RATE_CHANGE',
      subject: `${ctx.membership.lab.name}: ${entry.test.code} from ₹${entry.costPaise / 100} to ₹${rupees}`,
      body: why,
      priority: 'NORMAL',
    },
  });
  revalidatePath('/lab/catalog');
  return { ok: true, message: 'Sent to our partnerships team. The current rate applies until the agreement is updated.' };
}

const profileSchema = z.object({
  contactName: z.string().trim().min(2).max(120),
  contactPhone: z.string().trim().regex(/^\+?\d[\d\s-]{8,16}$/, 'Enter a valid phone number.'),
  contactEmail: z.email('Enter a valid email address.').max(254),
  website: z.string().trim().max(120),
});

/** The domain alone, e.g. "https://www.ananya.in/about" becomes "ananya.in". */
function domainOf(input: string): string {
  const raw = input.trim().toLowerCase();
  if (!raw) return '';
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export async function updateLabProfile(_prev: LabActionState, formData: FormData): Promise<LabActionState> {
  const ctx = await labContext({ roles: ['OWNER'] });
  if (!ctx.ok) return { ok: false, message: ctx.message.replace('an owner or a manager', 'the owner') };
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Please check the details.' };
  const website = domainOf(parsed.data.website);
  if (parsed.data.website && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(website)) {
    return { ok: false, message: 'Enter your website as a domain, such as ananyadiagnostics.in.' };
  }
  await db.lab.update({
    where: { id: ctx.membership.labId },
    data: { contactName: parsed.data.contactName, contactPhone: parsed.data.contactPhone, contactEmail: parsed.data.contactEmail, website },
  });
  await audit({
    action: 'LAB_PROFILE_UPDATED',
    entityType: 'Lab',
    entityId: ctx.membership.labId,
    actorUserId: ctx.user.id,
    actorRole: 'LAB',
  });
  revalidatePath('/lab/profile');
  return { ok: true, message: 'Saved.' };
}

/**
 * The permanent human verification gate.
 *
 * "The moment an automated summary reaches a family unreviewed, you have taken
 * on clinical risk you are not licensed to carry." So release is a person's
 * act, and it is the act that creates the follow-up call task and the critical
 * value alert.
 */
export async function verifyAndReleaseReport(reportId: string): Promise<LabActionState> {
  const user = await requireRole('OPS');

  const report = await db.report.findUnique({
    where: { id: reportId },
    include: { parameters: { include: { test: true } }, patient: true },
  });
  if (!report) return { ok: false, message: 'Report not found.' };

  if (!report.signedAt) {
    return {
      ok: false,
      reason: 'This report has not been signed by a pathologist.',
      remedy: 'Nothing is released before the laboratory’s pathologist has signed it on site.',
    };
  }

  const now = new Date();

  await db.report.update({
    where: { id: reportId },
    data: {
      status: 'RELEASED',
      summaryVerifiedByUserId: user.id,
      summaryVerifiedAt: now,
      releasedAt: now,
    },
  });

  await db.followUpCall.create({
    data: { reportId: report.id, bookingId: report.bookingId, dueBy: dueBy(now) },
  });

  for (const critical of report.parameters.filter((p) => p.isCritical)) {
    await db.criticalValueAlert.create({
      data: { reportId: report.id, parameterName: critical.test.name, raisedAt: now },
    });
    await audit({
      action: 'CRITICAL_VALUE_RAISED',
      entityType: 'Report',
      entityId: report.id,
      actorUserId: user.id,
      actorRole: 'OPS',
      detail: { parameterName: critical.test.name },
    });
  }

  await audit({
    action: 'REPORT_RELEASED',
    entityType: 'Report',
    entityId: report.id,
    actorUserId: user.id,
    actorRole: 'OPS',
    detail: { verifiedBy: user.name },
  });

  // Publishing to ABHA happens only after release, and only where the patient
  // has an account and the lab is not publishing itself. A failure here never
  // blocks the family from getting their report.
  const published = await publishReportToAbha(reportId).catch(() => null);

  revalidatePath('/ops');
  revalidatePath('/caregiver');

  return {
    ok: true,
    message: `Released to the family.${published?.ok ? ' Also published to their ABHA health account.' : ''}`,
  };
}
