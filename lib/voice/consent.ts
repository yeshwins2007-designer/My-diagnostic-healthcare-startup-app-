/**
 * Which calls a family has turned on.
 *
 * Each kind of call is its own choice (India's DPDP Act asks for consent that
 * is specific and given by a clear action, so nothing is on until someone
 * turns it on). Turning one off also cancels any call of that kind already
 * waiting to be made.
 */

import { db } from '../db';
import { audit } from '../compliance/audit';
import { VoiceCallKind } from '../enums';
import { CALL_KINDS, consentWording } from './kinds';

export type CallPreferences = Record<VoiceCallKind, boolean>;

export function noCalls(): CallPreferences {
  return Object.fromEntries(CALL_KINDS.map((k) => [k.kind, false])) as CallPreferences;
}

export async function getCallPreferences(familyId: string): Promise<CallPreferences> {
  const rows = await db.callPreference.findMany({ where: { familyId } });
  const prefs = noCalls();
  for (const row of rows) {
    if ((VoiceCallKind.values as readonly string[]).includes(row.kind)) prefs[row.kind as VoiceCallKind] = row.enabled;
  }
  return prefs;
}

export async function callsEnabled(familyId: string, kind: VoiceCallKind): Promise<boolean> {
  const row = await db.callPreference.findUnique({ where: { familyId_kind: { familyId, kind } } });
  return row?.enabled ?? false;
}

export async function setCallPreferences(input: {
  familyId: string;
  userId: string;
  /** The parent's first name, as it appeared in the wording they saw. */
  parentName: string;
  choices: Partial<CallPreferences>;
}): Promise<CallPreferences> {
  const before = await getCallPreferences(input.familyId);
  const changed: Partial<CallPreferences> = {};

  for (const [kind, enabled] of Object.entries(input.choices) as [VoiceCallKind, boolean][]) {
    if (!(VoiceCallKind.values as readonly string[]).includes(kind)) continue;
    const wording = consentWording(kind, input.parentName);
    await db.callPreference.upsert({
      where: { familyId_kind: { familyId: input.familyId, kind } },
      create: { familyId: input.familyId, kind, enabled, wording, decidedByUserId: input.userId },
      update: { enabled, wording, decidedByUserId: input.userId, decidedAt: new Date() },
    });
    if (before[kind] !== enabled) changed[kind] = enabled;
  }

  const turnedOff = (Object.entries(changed) as [VoiceCallKind, boolean][]).filter(([, on]) => !on).map(([k]) => k);
  if (turnedOff.length > 0) {
    await db.voiceCall.updateMany({
      where: { familyId: input.familyId, kind: { in: turnedOff }, status: 'SCHEDULED' },
      data: { status: 'CANCELLED', statusReason: 'The family turned this call off.' },
    });
  }

  if (Object.keys(changed).length > 0) {
    await audit({
      action: 'CALL_PREFERENCES_CHANGED',
      entityType: 'Family',
      entityId: input.familyId,
      actorUserId: input.userId,
      actorRole: 'CAREGIVER',
      detail: changed,
    });
  }
  return { ...before, ...input.choices } as CallPreferences;
}
