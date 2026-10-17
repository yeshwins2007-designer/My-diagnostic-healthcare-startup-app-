'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import { audit } from '@/lib/compliance/audit';
import { evaluateAlertClosure } from '@/lib/sop/criticalValue';
import { evaluateCompletion } from '@/lib/sop/followUp';
import { validateCertificateNumber } from '@/lib/sop/labRouting';
import { isRefusal } from '@/lib/sop/types';
import { AccreditationCheckKey } from '@/lib/enums';

export interface ActionResult {
  ok: boolean;
  message?: string;
  /** Present when an SOP rule refused, so the UI can show the remedy. */
  reason?: string;
  remedy?: string;
}

// --- critical values ---------------------------------------------------------

const criticalCallSchema = z.object({
  alertId: z.string().min(1),
  callNote: z.string().min(10, 'Record who you spoke to and what they said.'),
  writtenFollowUpSent: z.coerce.boolean(),
});

/**
 * Logging the call is a two-part act: the call itself, and the written
 * follow-up. The alert cannot close until both exist — "we tried" is not a
 * completed protocol.
 */
export async function logCriticalCall(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole('OPS');

  const parsed = criticalCallSchema.safeParse({
    alertId: formData.get('alertId'),
    callNote: String(formData.get('callNote') ?? ''),
    writtenFollowUpSent: formData.get('writtenFollowUpSent') === 'on',
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message };
  }

  const now = new Date();
  const alert = await db.criticalValueAlert.update({
    where: { id: parsed.data.alertId },
    data: {
      status: 'CAREGIVER_CALLED',
      calledAt: now,
      calledByUserId: user.id,
      callNote: parsed.data.callNote,
      writtenFollowUpSentAt: parsed.data.writtenFollowUpSent ? now : null,
    },
  });

  await audit({
    action: 'CRITICAL_VALUE_CALLED',
    entityType: 'CriticalValueAlert',
    entityId: alert.id,
    actorUserId: user.id,
    actorRole: 'OPS',
    detail: {
      parameterName: alert.parameterName,
      writtenFollowUp: parsed.data.writtenFollowUpSent,
    },
  });

  const closure = evaluateAlertClosure({
    calledAt: alert.calledAt,
    callNote: alert.callNote,
    writtenFollowUpSentAt: alert.writtenFollowUpSentAt,
  });

  if (isRefusal(closure)) {
    revalidatePath('/ops/critical');
    return {
      ok: true,
      message: 'Call logged.',
      reason: closure.reason,
      remedy: closure.remedy,
    };
  }

  await db.criticalValueAlert.update({
    where: { id: alert.id },
    data: { status: 'CLOSED', closedAt: now },
  });

  revalidatePath('/ops/critical');
  return { ok: true, message: 'Call logged and the alert is closed.' };
}

// --- follow-up calls ---------------------------------------------------------

const followUpSchema = z.object({
  callId: z.string().min(1),
  whatWorriedYou: z.string().min(3),
  whatWouldImprove: z.string().min(3),
});

export async function completeFollowUp(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole('OPS');

  const answers = {
    whatWorriedYou: String(formData.get('whatWorriedYou') ?? ''),
    whatWouldImprove: String(formData.get('whatWouldImprove') ?? ''),
  };

  const parsed = followUpSchema.safeParse({
    callId: formData.get('callId'),
    ...answers,
  });

  if (!parsed.success) {
    const decision = evaluateCompletion(answers);
    if (isRefusal(decision)) {
      return { ok: false, reason: decision.reason, remedy: decision.remedy };
    }
    return { ok: false, message: 'Please check the answers.' };
  }

  await db.followUpCall.update({
    where: { id: parsed.data.callId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      placedByUserId: user.id,
      whatWorriedYou: parsed.data.whatWorriedYou,
      whatWouldImprove: parsed.data.whatWouldImprove,
    },
  });

  await audit({
    action: 'FOLLOW_UP_CALL_COMPLETED',
    entityType: 'FollowUpCall',
    entityId: parsed.data.callId,
    actorUserId: user.id,
    actorRole: 'OPS',
  });

  revalidatePath('/ops/follow-ups');
  return { ok: true, message: 'Call recorded.' };
}

// --- lab verification --------------------------------------------------------

const checkSchema = z.object({
  accreditationId: z.string().min(1),
  checkKey: AccreditationCheckKey.schema,
  passed: z.coerce.boolean(),
  note: z.string().max(1000).default(''),
});

export async function recordAccreditationCheck(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole('OPS');

  const parsed = checkSchema.safeParse({
    accreditationId: formData.get('accreditationId'),
    checkKey: formData.get('checkKey'),
    passed: formData.get('passed') === 'yes',
    note: String(formData.get('note') ?? ''),
  });

  if (!parsed.success) return { ok: false, message: 'Could not record that check.' };

  await db.accreditationCheck.upsert({
    where: {
      accreditationId_checkKey: {
        accreditationId: parsed.data.accreditationId,
        checkKey: parsed.data.checkKey,
      },
    },
    create: {
      accreditationId: parsed.data.accreditationId,
      checkKey: parsed.data.checkKey,
      passed: parsed.data.passed,
      note: parsed.data.note,
      checkedByUserId: user.id,
    },
    update: {
      passed: parsed.data.passed,
      note: parsed.data.note,
      checkedByUserId: user.id,
      checkedAt: new Date(),
    },
  });

  await audit({
    action: 'LAB_CHECK_RECORDED',
    entityType: 'LabAccreditation',
    entityId: parsed.data.accreditationId,
    actorUserId: user.id,
    actorRole: 'OPS',
    detail: { checkKey: parsed.data.checkKey, passed: parsed.data.passed },
  });

  revalidatePath('/ops/labs');
  return { ok: true, message: 'Check recorded.' };
}

/**
 * Activation is the moment a lab becomes able to receive human samples. It
 * requires all seven checks to have been made and passed by a person — there
 * is deliberately no path to ACTIVE that skips that record.
 */
export async function activateLab(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole('OPS');
  const labId = String(formData.get('labId') ?? '');

  const lab = await db.lab.findUnique({
    where: { id: labId },
    include: { accreditation: { include: { checks: true } } },
  });

  if (!lab?.accreditation) {
    return { ok: false, message: 'That lab has no accreditation record.' };
  }

  const certificate = validateCertificateNumber(lab.accreditation.certificateNumber);
  if (isRefusal(certificate)) {
    return { ok: false, reason: certificate.reason, remedy: certificate.remedy };
  }

  const passed = new Set(
    lab.accreditation.checks.filter((c) => c.passed).map((c) => c.checkKey),
  );
  const missing = AccreditationCheckKey.values.filter((key) => !passed.has(key));

  if (missing.length > 0) {
    return {
      ok: false,
      reason: `${missing.length} of the seven verification checks ${missing.length === 1 ? 'has' : 'have'} not been passed.`,
      remedy:
        'Work through every item on the checklist before activating. A lab that is not ACTIVE cannot receive a single sample, and that is the point.',
    };
  }

  if (lab.accreditation.validUntil <= new Date()) {
    return {
      ok: false,
      reason: 'The accreditation has already expired.',
      remedy: 'Obtain the renewed certificate before activating.',
    };
  }

  await db.lab.update({
    where: { id: labId },
    data: { status: 'ACTIVE', activatedAt: new Date(), statusReason: '' },
  });
  await db.labAccreditation.update({
    where: { id: lab.accreditation.id },
    data: { verificationState: 'PASSED' },
  });

  await audit({
    action: 'LAB_ACTIVATED',
    entityType: 'Lab',
    entityId: labId,
    actorUserId: user.id,
    actorRole: 'OPS',
    detail: { certificateNumber: lab.accreditation.certificateNumber },
  });

  revalidatePath('/ops/labs');
  return { ok: true, message: `${lab.name} is now active and can receive samples.` };
}

export async function suspendLab(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireRole('OPS');
  const labId = String(formData.get('labId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();

  if (reason.length < 10) {
    return { ok: false, message: 'Give a reason of at least a sentence.' };
  }

  const lab = await db.lab.update({
    where: { id: labId },
    data: { status: 'SUSPENDED', statusReason: reason },
  });

  await audit({
    action: 'LAB_SUSPENDED',
    entityType: 'Lab',
    entityId: labId,
    actorUserId: user.id,
    actorRole: 'OPS',
    detail: { reason },
  });

  revalidatePath('/ops/labs');
  return {
    ok: true,
    message: `${lab.name} is suspended. No further samples will route there.`,
  };
}
