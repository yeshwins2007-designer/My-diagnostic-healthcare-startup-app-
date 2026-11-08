'use client';

import { useActionState, useState } from 'react';
import { deleteMyAccount, type DeleteAccountState } from '@/app/actions/account';
import { Button, cx } from '@/components/ui';

/**
 * Delete account, in Profile. Two steps on the same screen: open, read what
 * happens, tick, confirm. Nothing is hidden behind a phone call, which both
 * app stores require.
 */
export function DeleteAccount({ kind, eraseAfterDays }: { kind: 'family' | 'partner'; eraseAfterDays: number }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<DeleteAccountState, FormData>(deleteMyAccount, { ok: false });

  return (
    <section aria-labelledby="delete-account" className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex min-h-11 items-center self-start font-semibold text-[var(--color-red)] underline"
        id="delete-account"
      >
        {kind === 'family' ? 'Delete my account' : 'Close my partner account'}
      </button>
      <div className="disclosure" data-open={open}>
        {/* Closed, the form is clipped to nothing: inert keeps it out of Tab order and screen readers too. */}
        <div inert={!open}>
          <form action={action} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-red)] p-5">
            {kind === 'family' ? (
              <ul className="flex list-disc flex-col gap-1.5 pl-5 text-small text-[var(--color-ink-soft)]">
                <li>You’re signed out on every device, straight away.</li>
                <li>Your Medwyn One membership is cancelled, and unpaid bookings too.</li>
                <li>Within {eraseAfterDays} days we erase your details and your parents’ details.</li>
                <li>The lab keeps the reports it signed, and we keep payment records, because the law requires both. They no longer carry your name.</li>
                <li>If a visit is still under way, finish or cancel it first.</li>
              </ul>
            ) : (
              <p className="text-small text-[var(--color-ink-soft)]">
                Our partnerships team closes the account within {eraseAfterDays} days, after any
                samples already with you are finished, and calls you to confirm.
              </p>
            )}
            <label className="flex items-start gap-3 text-small">
              <input type="checkbox" name="confirm" value="yes" required className="mt-0.5 h-6 w-6 shrink-0" />
              <span>{kind === 'family' ? 'I understand. Delete my account.' : 'I understand. Close my partner account.'}</span>
            </label>
            {state.message && (
              <p role="status" className={cx('text-small font-medium', state.ok ? 'text-[var(--color-green)]' : 'text-[var(--color-red)]')}>
                {state.message}
              </p>
            )}
            <Button type="submit" tone="danger" disabled={pending} className="self-start">
              {pending ? 'One moment…' : kind === 'family' ? 'Delete my account' : 'Ask to close it'}
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}
