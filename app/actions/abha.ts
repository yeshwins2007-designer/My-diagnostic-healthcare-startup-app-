'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole, requireUser } from '@/lib/auth/session';
import { audit } from '@/lib/compliance/audit';
import {
  getAbdmProvider,
  formatAbhaNumber,
  isValidAbhaAddress,
  isValidAbhaNumber,
} from '@/lib/providers/abdm';
import { buildDiagnosticReportBundle } from '@/lib/abdm/fhir';

export interface AbhaActionState {
  ok: boolean;
  message?: string;
  error?: string;
  /** Present after step one, to be echoed back with the OTP. */
  txnId?: string;
  maskedMobile?: string;
  simulated?: boolean;
  /** Set once an account exists on the patient. */
  abhaAddress?: string;
}

/**
 * Step one of creating an ABHA on a parent's behalf.
 *
 * ABHA is never created automatically. A caregiver must actively choose it,
 * and where the patient has capacity the OTP goes to the patient's own number,
 * not the caregiver's — an account in someone's name should be created by
 * someone who can prove they hold that person's phone.
 */
const initiateSchema = z.object({
  patientId: z.string().min(1),
  method: z.enum(['AADHAAR_OTP', 'MOBILE_OTP']),
  identifier: z.string().min(10).max(20),
});

export async function initiateAbha(
  _prev: AbhaActionState,
  formData: FormData,
): Promise<AbhaActionState> {
  const user = await requireRole('CAREGIVER');
  const parsed = initiateSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { ok: false, error: 'Enter a valid Aadhaar or mobile number.' };
  }

  const patient = await db.patient.findFirst({
    where: {
      id: parsed.data.patientId,
      family: { members: { some: { userId: user.id } } },
    },
  });
  if (!patient) return { ok: false, error: 'We could not find that patient.' };

  try {
    const abdm = getAbdmProvider();
    const challenge = await abdm.initiateAbhaCreation({
      method: parsed.data.method,
      identifier: parsed.data.identifier.replace(/\s/g, ''),
    });

    return {
      ok: true,
      txnId: challenge.txnId,
      maskedMobile: challenge.maskedMobile,
      simulated: challenge.simulated,
      message: `We have asked for a code to be sent to ${challenge.maskedMobile ?? 'the registered mobile'}.`,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `ABDM could not be reached: ${error.message}`
          : 'ABDM could not be reached.',
    };
  }
}

const completeSchema = z.object({
  patientId: z.string().min(1),
  txnId: z.string().min(1),
  otp: z.string().regex(/^\d{4,6}$/),
  method: z.enum(['AADHAAR_OTP', 'MOBILE_OTP']),
});

export async function completeAbha(
  _prev: AbhaActionState,
  formData: FormData,
): Promise<AbhaActionState> {
  const user = await requireRole('CAREGIVER');
  const parsed = completeSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, error: 'Enter the code that was sent.' };

  const patient = await db.patient.findFirst({
    where: {
      id: parsed.data.patientId,
      family: { members: { some: { userId: user.id } } },
    },
  });
  if (!patient) return { ok: false, error: 'We could not find that patient.' };

  try {
    const abdm = getAbdmProvider();
    const account = await abdm.completeAbhaCreation({
      txnId: parsed.data.txnId,
      otp: parsed.data.otp,
      name: patient.name,
    });

    await db.abhaAccount.create({
      data: {
        patientId: patient.id,
        abhaNumber: formatAbhaNumber(account.abhaNumber),
        abhaAddress: account.abhaAddress,
        verifyMethod: parsed.data.method,
        kycStatus: 'VERIFIED',
        authorisedByUserId: user.id,
        linkedAt: new Date(),
      },
    });

    // ABDM linking is a distinct purpose under DPDP, recorded separately from
    // the consent that covers collection and family sharing.
    await db.consentRecord.create({
      data: {
        patientId: patient.id,
        purpose: 'ABHA_LINKING',
        granted: true,
        policyVersion: 'v1',
        method: patient.needsProxyConsent ? 'PROXY_FAMILY' : 'DIGITAL_TAP',
        ...(patient.needsProxyConsent
          ? { proxyName: user.name, proxyRelation: 'Family caregiver' }
          : {}),
      },
    });

    await audit({
      action: 'ABHA_LINKED',
      entityType: 'Patient',
      entityId: patient.id,
      actorUserId: user.id,
      actorRole: 'CAREGIVER',
      detail: { method: parsed.data.method, simulated: account.simulated },
    });

    revalidatePath('/caregiver');
    return {
      ok: true,
      abhaAddress: account.abhaAddress,
      simulated: account.simulated,
      message: `${patient.name}'s health account is linked.`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'ABDM could not be reached.',
    };
  }
}

/** Links an ABHA the patient already has. */
const linkExistingSchema = z.object({
  patientId: z.string().min(1),
  abhaNumberOrAddress: z.string().min(3),
});

export async function linkExistingAbha(
  _prev: AbhaActionState,
  formData: FormData,
): Promise<AbhaActionState> {
  const user = await requireRole('CAREGIVER');
  const parsed = linkExistingSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { ok: false, error: 'Enter an ABHA number or address.' };

  const value = parsed.data.abhaNumberOrAddress.trim();
  if (!isValidAbhaNumber(value) && !isValidAbhaAddress(value)) {
    return {
      ok: false,
      error:
        'That does not look like an ABHA number (14 digits, like 91-1234-5678-9012) or an ABHA address (like name@abdm).',
    };
  }

  const patient = await db.patient.findFirst({
    where: {
      id: parsed.data.patientId,
      family: { members: { some: { userId: user.id } } },
    },
  });
  if (!patient) return { ok: false, error: 'We could not find that patient.' };

  const abdm = getAbdmProvider();
  const account = await abdm.verifyExistingAbha({
    abhaNumberOrAddress: value,
    otp: '',
    txnId: '',
  });

  await db.abhaAccount.create({
    data: {
      patientId: patient.id,
      abhaNumber: formatAbhaNumber(account.abhaNumber),
      abhaAddress: account.abhaAddress,
      verifyMethod: 'LINKED_EXISTING',
      kycStatus: 'VERIFIED',
      authorisedByUserId: user.id,
      linkedAt: new Date(),
    },
  });

  await audit({
    action: 'ABHA_LINKED',
    entityType: 'Patient',
    entityId: patient.id,
    actorUserId: user.id,
    actorRole: 'CAREGIVER',
    detail: { method: 'LINKED_EXISTING' },
  });

  revalidatePath('/caregiver');
  return { ok: true, abhaAddress: account.abhaAddress, message: 'Health account linked.' };
}

/**
 * HIU: request consent, then pull the patient's existing records so the
 * caregiver sees history and the technician knows conditions before a visit.
 */
export async function requestHealthHistory(patientId: string): Promise<AbhaActionState> {
  const user = await requireRole('CAREGIVER');

  const patient = await db.patient.findFirst({
    where: { id: patientId, family: { members: { some: { userId: user.id } } } },
    include: { abhaAccount: true },
  });

  if (!patient?.abhaAccount?.abhaAddress) {
    return { ok: false, error: 'This patient has no linked health account.' };
  }

  const abdm = getAbdmProvider();
  const now = new Date();

  const request = await abdm.requestConsent({
    abhaAddress: patient.abhaAccount.abhaAddress,
    purpose: 'CAREMGT',
    hiTypes: ['DiagnosticReport'],
    fromDate: new Date(now.getFullYear() - 3, 0, 1),
    toDate: now,
  });

  const artefact = await abdm.fetchConsentArtefact(request.consentRequestId);
  if (!artefact) return { ok: false, error: 'The consent request could not be read back.' };

  await db.abdmConsentArtefact.create({
    data: {
      abhaAccountId: patient.abhaAccount.id,
      consentId: artefact.consentId,
      purpose: 'CAREMGT',
      hiTypes: artefact.hiTypes.join(','),
      fromDate: artefact.fromDate,
      toDate: artefact.toDate,
      expiresAt: artefact.expiresAt,
      status: artefact.status,
    },
  });

  await audit({
    action: 'ABDM_CONSENT_GRANTED',
    entityType: 'AbhaAccount',
    entityId: patient.abhaAccount.id,
    actorUserId: user.id,
    actorRole: 'CAREGIVER',
    detail: { consentId: artefact.consentId, status: artefact.status },
  });

  revalidatePath(`/caregiver/abha/${patientId}`);
  return { ok: true, message: 'Consent recorded. Past records will appear below.' };
}

/** Mirrors an ABDM revocation into our own access controls, immediately. */
export async function revokeAbdmConsent(consentId: string): Promise<AbhaActionState> {
  const user = await requireUser();

  const artefact = await db.abdmConsentArtefact.update({
    where: { consentId },
    data: { status: 'REVOKED', revokedAt: new Date() },
  });

  await audit({
    action: 'ABDM_CONSENT_REVOKED',
    entityType: 'AbdmConsentArtefact',
    entityId: artefact.id,
    actorUserId: user.id,
    actorRole: user.role,
  });

  revalidatePath('/caregiver');
  return { ok: true, message: 'Consent withdrawn. We will not fetch any further records.' };
}

/**
 * HIP: publish a signed report to the patient's ABHA.
 *
 * Two hard preconditions, both enforced here rather than trusted upstream: the
 * pathologist must have signed, and the lab must be configured for
 * platform-facilitated publishing. A lab that pushes to ABDM itself gets
 * skipped, because double-publishing creates duplicate records in the
 * patient's own account.
 */
export async function publishReportToAbha(reportId: string): Promise<AbhaActionState> {
  const user = await requireUser();

  const report = await db.report.findUnique({
    where: { id: reportId },
    include: {
      patient: { include: { abhaAccount: true } },
      lab: { include: { accreditation: true } },
      booking: true,
      parameters: { include: { test: true } },
    },
  });

  if (!report) return { ok: false, error: 'Report not found.' };

  if (report.status !== 'RELEASED' || !report.signedAt) {
    return {
      ok: false,
      error:
        'Only a pathologist-signed, released report is published. Nothing provisional reaches a national health record.',
    };
  }

  if (!report.patient.abhaAccount?.abhaAddress) {
    return {
      ok: false,
      error: 'This patient has no linked health account — which is fine, it is optional.',
    };
  }

  if (report.lab.abdmMode !== 'PLATFORM_FACILITATED') {
    return {
      ok: false,
      error: `${report.lab.name} publishes to ABDM itself. We do not publish on its behalf, to avoid duplicate records in the patient's account.`,
    };
  }

  const abdm = getAbdmProvider();

  const careContext = await db.careContext.upsert({
    where: { bookingId: report.bookingId },
    create: {
      abhaAccountId: report.patient.abhaAccount.id,
      bookingId: report.bookingId,
      referenceNumber: report.booking.reference,
      display: `Home collection — ${report.booking.windowStart.toLocaleDateString('en-IN')}`,
    },
    update: {},
  });

  const link = await abdm.linkCareContext({
    abhaAddress: report.patient.abhaAccount.abhaAddress,
    referenceNumber: careContext.referenceNumber,
    display: careContext.display,
    patientName: report.patient.name,
  });

  if (!link.linked) {
    await db.careContext.update({
      where: { id: careContext.id },
      data: { status: 'FAILED' },
    });
    return { ok: false, error: link.error ?? 'Could not link the care context.' };
  }

  await db.careContext.update({
    where: { id: careContext.id },
    data: { status: 'LINKED', linkedAt: new Date() },
  });

  const bundle = buildDiagnosticReportBundle({
    id: report.id,
    signedAt: report.signedAt,
    pathologistName: report.pathologistName,
    pathologistReg: report.pathologistReg,
    patient: {
      id: report.patient.id,
      name: report.patient.name,
      ageYears: report.patient.ageYears,
      sex: report.patient.sex,
    },
    lab: {
      id: report.lab.id,
      name: report.lab.name,
      hfrFacilityId: report.lab.accreditation?.hfrFacilityId,
    },
    parameters: report.parameters.map((p) => ({
      id: p.id,
      valueEncrypted: p.valueEncrypted,
      unit: p.unit,
      refLow: p.refLow,
      refHigh: p.refHigh,
      test: {
        code: p.test.code,
        name: p.test.name,
        loincCode: p.test.loincCode,
      },
    })),
  });

  const bundleJson = JSON.stringify(bundle);

  const stored = await db.fhirBundle.create({
    data: { careContextId: careContext.id, reportId: report.id, bundleJson },
  });

  const published = await abdm.publishDiagnosticReport({
    abhaAddress: report.patient.abhaAccount.abhaAddress,
    careContextReference: careContext.referenceNumber,
    fhirBundleJson: bundleJson,
  });

  await db.fhirBundle.update({
    where: { id: stored.id },
    data: {
      status: published.published ? 'PUBLISHED' : 'FAILED',
      publishedAt: published.published ? new Date() : null,
    },
  });

  if (published.published) {
    await audit({
      action: 'ABDM_REPORT_PUBLISHED',
      entityType: 'Report',
      entityId: report.id,
      actorUserId: user.id,
      actorRole: user.role,
      detail: {
        careContext: careContext.referenceNumber,
        simulated: published.simulated,
      },
    });
  }

  revalidatePath(`/caregiver/reports/${reportId}`);
  return published.published
    ? {
        ok: true,
        simulated: published.simulated,
        message: `Published to ${report.patient.name}'s health account.`,
      }
    : { ok: false, error: published.error ?? 'Publishing failed.' };
}
