'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import { loadFamilyContext } from '@/lib/queries/caregiver';
import { VoiceCallKind } from '@/lib/enums';
import { isLocale } from '@/lib/i18n/locales';
import { setCallPreferences, type CallPreferences } from '@/lib/voice/consent';
import { isValidTimeZone } from '@/lib/voice/time';
import { firstName } from '@/lib/voice/scripts';

export interface CallSettingsState {
  ok: boolean;
  message?: string;
}

/**
 * The family's choices about the assistant's calls: which ones, the language
 * each parent is spoken to in, and the time zone the family lives in. Sent by
 * the first-run sheet and by Profile. Every kind is set explicitly from the
 * form, so a box left unticked is a "no", recorded as one.
 */
export async function saveCallSettings(_prev: CallSettingsState, formData: FormData): Promise<CallSettingsState> {
  const user = await requireRole('CAREGIVER');
  const { family } = await loadFamilyContext(user);
  if (!family) return { ok: false, message: 'Add your parent first.' };

  const choices = Object.fromEntries(
    VoiceCallKind.values.map((kind) => [kind, formData.get(`call_${kind}`) === 'on']),
  ) as CallPreferences;
  await setCallPreferences({
    familyId: family.id,
    userId: user.id,
    parentName: family.patients[0] ? firstName(family.patients[0].name) : 'your parent',
    choices,
  });

  for (const patient of family.patients) {
    const language = String(formData.get(`language_${patient.id}`) ?? '');
    if (language && isLocale(language) && language !== patient.language) {
      await db.patient.update({ where: { id: patient.id }, data: { language } });
    }
  }

  const timeZone = String(formData.get('timeZone') ?? '');
  await db.user.update({
    where: { id: user.id },
    data: {
      ...(timeZone && isValidTimeZone(timeZone) ? { timeZone } : {}),
      callsIntroSeenAt: new Date(),
    },
  });

  // No revalidation here: the sheet stays on screen to say it is done, and
  // refreshes the page itself when it closes.
  const on = Object.values(choices).filter(Boolean).length;
  return { ok: true, message: on === 0 ? 'Saved. No calls for now.' : `Saved. ${on === 1 ? 'One call is' : `${on} calls are`} on.` };
}

/** "Not now": the sheet stays closed, nothing is turned on, and the time zone is kept. */
export async function dismissCallsIntro(timeZone?: string) {
  const user = await requireRole('CAREGIVER');
  await db.user.update({
    where: { id: user.id },
    data: { callsIntroSeenAt: new Date(), ...(timeZone && isValidTimeZone(timeZone) ? { timeZone } : {}) },
  });
}

/** A visit asked for by phone that the family does not want. */
export async function declineBookingRequest(requestId: string) {
  const user = await requireRole('CAREGIVER');
  const { family } = await loadFamilyContext(user);
  if (!family) return;
  await db.voiceBookingRequest.updateMany({
    where: { id: requestId, familyId: family.id, status: 'NEW' },
    data: { status: 'DECLINED', handledByUserId: user.id, handledAt: new Date() },
  });
  revalidatePath('/caregiver');
}
