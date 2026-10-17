'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import { audit } from '@/lib/compliance/audit';
import { issueElderLink } from '@/lib/auth/elder';

/** The family's own patient, or null: every Elder Mode action is scoped through it. */
async function familyPatient(patientId: string, userId: string) {
  return db.patient.findFirst({
    where: { id: patientId, family: { members: { some: { userId } } } },
    select: { id: true, name: true },
  });
}

export type ElderLinkResult = { ok: true; path: string } | { ok: false; message: string };

/** A one-time link that sets up Elder Mode on the parent's phone. */
export async function createElderLink(patientId: string): Promise<ElderLinkResult> {
  const user = await requireRole('CAREGIVER');
  const patient = await familyPatient(patientId, user.id);
  if (!patient) return { ok: false, message: 'We could not find that person.' };

  const { token, accessId } = await issueElderLink(patient.id, user.id);
  await audit({
    action: 'CONSENT_GRANTED',
    entityType: 'ElderAccess',
    entityId: accessId,
    actorUserId: user.id,
    actorRole: 'CAREGIVER',
    detail: { event: 'elder_link_created', patientId: patient.id },
  });
  revalidatePath('/caregiver/profile');
  return { ok: true, path: `/elder/open/${token}` };
}

/** Turns Elder Mode off on one phone, or cancels an unopened link. Immediate. */
export async function revokeElderAccess(accessId: string): Promise<void> {
  const user = await requireRole('CAREGIVER');
  const access = await db.elderAccess.findFirst({
    where: { id: accessId, revokedAt: null, patient: { family: { members: { some: { userId: user.id } } } } },
  });
  if (!access) return;
  await db.elderAccess.update({ where: { id: access.id }, data: { revokedAt: new Date() } });
  await audit({
    action: 'CONSENT_WITHDRAWN',
    entityType: 'ElderAccess',
    entityId: access.id,
    actorUserId: user.id,
    actorRole: 'CAREGIVER',
    detail: { event: 'elder_access_revoked', patientId: access.patientId },
  });
  revalidatePath('/caregiver/profile');
}
