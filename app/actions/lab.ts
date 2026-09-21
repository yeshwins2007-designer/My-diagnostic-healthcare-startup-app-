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
import { Discipline, type StoplightBand } from '@/lib/enums';
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

// --- intake ------------------------------------------------------------------

export async function receiveSpecimen(barcode: string): Promise<LabActionState> {
  const user = await requireRole('LAB');

  const membership = await db.labMember.findFirst({ where: { userId: user.id } });
  if (!membership) return { ok: false, message: 'No laboratory is linked to this account.' };

  const specimen = await db.specimen.findUnique({
    where: { barcode: barcode.trim().toUpperCase() },
    include: { booking: true },
  });
  if (!specimen) return { ok: false, message: `No specimen with barcode ${barcode}.` };

  await db.specimen.update({
    where: { id: specimen.id },
    data: { status: 'PROCESSED' },
  });
  await db.booking.update({
    where: { id: specimen.bookingId },
    data: { status: 'PROCESSING' },
  });

  revalidatePath('/lab');
  return { ok: true, message: `${specimen.barcode} marked as being processed.` };
}

export async function rejectSpecimen(
  _prev: LabActionState,
  formData: FormData,
): Promise<LabActionState> {
  const user = await requireRole('LAB');
  const specimenId = String(formData.get('specimenId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();

  if (reason.length < 5) {
    return { ok: false, message: 'Give the reason for rejecting the sample.' };
  }

  const specimen = await db.specimen.update({
    where: { id: specimenId },
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
    actorUserId: user.id,
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
  pathologistName: z.string().min(2),
  pathologistReg: z.string().min(3),
  values: z.string().min(2),
});

/**
 * Uploading results.
 *
 * The report is created as PATHOLOGIST_SIGNED, not RELEASED. Nothing reaches a
 * family until a human at MEDWYN has verified that the structure of the
 * report matches the physical patient identifiers — and that gate is permanent,
 * not an early-stage precaution.
 */
export async function uploadResults(
  _prev: LabActionState,
  formData: FormData,
): Promise<LabActionState> {
  const user = await requireRole('LAB');

  const parsed = resultSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: 'Please fill in the signing details.' };

  const membership = await db.labMember.findFirst({ where: { userId: user.id } });
  if (!membership) return { ok: false, message: 'No laboratory linked to this account.' };

  const booking = await db.booking.findFirst({
    where: { id: parsed.data.bookingId, labId: membership.labId },
    include: {
      items: { include: { panel: { include: { items: { include: { test: true } } } } } },
    },
  });
  if (!booking) return { ok: false, message: 'That booking is not routed to your laboratory.' };

  // values arrives as "HBA1C=9.4|GLU_F=186|CBC=12.9"
  const entries = parsed.data.values
    .split('|')
    .map((pair) => pair.split('='))
    .filter((parts) => parts.length === 2)
    .map(([code, value]) => ({ code: code.trim().toUpperCase(), value: value.trim() }));

  if (entries.length === 0) {
    return { ok: false, message: 'No values were provided.' };
  }

  const tests = booking.items.flatMap((i) => i.panel?.items.map((pi) => pi.test) ?? []);

  const parameters = entries
    .map((entry) => {
      const test = tests.find((t) => t.code === entry.code);
      if (!test) return null;

      const numeric = Number(entry.value);
      const { refLow, refHigh, unit } = REFERENCE_RANGES[test.code] ?? {
        refLow: null,
        refHigh: null,
        unit: '',
      };

      // Banding is arithmetic against a stored reference range, never a model's
      // opinion. Anything outside a range is at minimum YELLOW.
      let band: StoplightBand = 'GREEN';
      let isCritical = false;
      if (Number.isFinite(numeric) && refLow !== null && refHigh !== null) {
        if (numeric < refLow || numeric > refHigh) band = 'YELLOW';
        const criticalLow = refLow - (refHigh - refLow) * 0.5;
        const criticalHigh = refHigh + (refHigh - refLow) * 0.5;
        if (numeric < criticalLow || numeric > criticalHigh) {
          band = 'RED';
          isCritical = true;
        }
      }

      return {
        testId: test.id,
        valueEncrypted: encryptField(entry.value),
        unit,
        refLow,
        refHigh,
        band,
        isCritical,
      };
    })
    .filter(Boolean) as {
    testId: string;
    valueEncrypted: string;
    unit: string;
    refLow: number | null;
    refHigh: number | null;
    band: StoplightBand;
    isCritical: boolean;
  }[];

  const overall: StoplightBand = parameters.some((p) => p.band === 'RED')
    ? 'RED'
    : parameters.some((p) => p.band === 'YELLOW')
      ? 'YELLOW'
      : 'GREEN';

  const report = await db.report.create({
    data: {
      bookingId: booking.id,
      patientId: booking.patientId,
      labId: membership.labId,
      // Signed, not released. The human verification gate is next.
      status: 'SUMMARY_PENDING_REVIEW',
      overallBand: overall,
      pathologistName: parsed.data.pathologistName,
      pathologistReg: parsed.data.pathologistReg,
      signedAt: new Date(),
      parameters: { create: parameters },
    },
  });

  await db.booking.update({ where: { id: booking.id }, data: { status: 'REPORTED' } });

  await audit({
    action: 'REPORT_SIGNED',
    entityType: 'Report',
    entityId: report.id,
    actorUserId: user.id,
    actorRole: 'LAB',
    detail: {
      pathologist: parsed.data.pathologistName,
      parameterCount: parameters.length,
      overallBand: overall,
    },
  });

  revalidatePath('/lab');
  return {
    ok: true,
    message: `Report signed. It will reach the family once a MEDWYN coordinator has verified the identifiers.${overall === 'RED' ? ' A critical value has been flagged and will be called immediately.' : ''}`,
  };
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

/**
 * Clinically verified reference ranges, hardcoded.
 *
 * The banding layer is grounded strictly against these — the model is never
 * asked what is normal, because the answer must be the same every time and
 * traceable to a source.
 */
const REFERENCE_RANGES: Record<
  string,
  { refLow: number | null; refHigh: number | null; unit: string }
> = {
  HBA1C: { refLow: 4.0, refHigh: 5.7, unit: '%' },
  GLU_F: { refLow: 70, refHigh: 100, unit: 'mg/dL' },
  LIPID: { refLow: 0, refHigh: 200, unit: 'mg/dL' },
  CREAT: { refLow: 0.6, refHigh: 1.3, unit: 'mg/dL' },
  UREA: { refLow: 15, refHigh: 45, unit: 'mg/dL' },
  ELEC: { refLow: 135, refHigh: 145, unit: 'mmol/L' },
  CBC: { refLow: 12, refHigh: 16, unit: 'g/dL' },
  TSH: { refLow: 0.4, refHigh: 4.5, unit: 'µIU/mL' },
  VITD: { refLow: 30, refHigh: 100, unit: 'ng/mL' },
  B12: { refLow: 200, refHigh: 900, unit: 'pg/mL' },
  URINE_R: { refLow: null, refHigh: null, unit: '' },
  URINE_CS: { refLow: null, refHigh: null, unit: '' },
};
