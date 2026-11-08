'use server';

import { redirect } from 'next/navigation';
import { requireUser, destroySession } from '@/lib/auth/session';
import { closeAccount } from '@/lib/account/deletion';

export interface DeleteAccountState {
  ok: boolean;
  message?: string;
}

/**
 * "Delete my account", from Profile. The person has already confirmed on the
 * screen; this re-checks who they are, closes the account (see
 * lib/account/deletion.ts) and signs this device out.
 */
export async function deleteMyAccount(_prev: DeleteAccountState, formData: FormData): Promise<DeleteAccountState> {
  const user = await requireUser();
  if (formData.get('confirm') !== 'yes') return { ok: false, message: 'Tick the box to confirm.' };

  const result = await closeAccount(user.id);
  if (!result.ok) return result;
  if (!result.closed) return { ok: true, message: result.message };

  await destroySession();
  redirect('/account-deleted');
}
