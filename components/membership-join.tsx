'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { startMembership, type PaymentActionState } from '@/app/actions/payments';
import { formatINR } from '@/lib/money';
import { Button, RefusalNotice } from '@/components/ui';

type Method = 'UPI_AUTOPAY' | 'CARD' | 'APPLE_PAY';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" full disabled={pending}>
      {pending ? 'Setting up…' : label}
    </Button>
  );
}

export function MembershipJoin({
  monthlyPaise,
  yearlyPaise,
}: {
  monthlyPaise: number;
  yearlyPaise: number;
}) {
  const [cycle, setCycle] = useState<'MONTHLY' | 'ANNUAL'>('ANNUAL');
  const [method, setMethod] = useState<Method>('UPI_AUTOPAY');
  const [state, action] = useActionState<PaymentActionState, FormData>(startMembership, { ok: false });

  useEffect(() => {
    if (state.ok && state.authUrl) window.location.assign(state.authUrl);
  }, [state]);

  const price = cycle === 'ANNUAL' ? yearlyPaise : monthlyPaise;

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="billingCycle" value={cycle} />
      <input type="hidden" name="method" value={method} />

      <div role="radiogroup" aria-label="How often to pay" className="grid grid-cols-2 gap-3">
        {(
          [
            ['MONTHLY', 'Monthly', monthlyPaise, 'a month'],
            ['ANNUAL', 'Yearly', yearlyPaise, 'a year'],
          ] as const
        ).map(([value, label, p, per]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={cycle === value}
            onClick={() => setCycle(value)}
            className={`flex min-h-[var(--size-touch)] flex-col items-start gap-1 rounded-[var(--radius-card)] border-2 p-4 text-left ${
              cycle === value
                ? 'border-[var(--color-primary)] bg-[var(--color-primary-wash)]'
                : 'border-[var(--card-border)] bg-[var(--field-bg)]'
            }`}
          >
            <span className="text-small font-semibold text-[var(--color-ink-soft)]">{label}</span>
            <span className="text-h3 font-bold">{formatINR(p)}</span>
            <span className="text-small text-[var(--color-ink-soft)]">{per}</span>
          </button>
        ))}
      </div>

      <div role="radiogroup" aria-label="How to pay" className="grid gap-3">
        {(
          [
            ['UPI_AUTOPAY', 'UPI Autopay', 'Approve once in your UPI app; renews automatically'],
            ['CARD', 'Card', 'Debit or credit card'],
            ['APPLE_PAY', 'Apple Pay', 'Pay with Face ID or Touch ID'],
          ] as const
        ).map(([value, label, hint]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={method === value}
            onClick={() => setMethod(value)}
            className={`flex min-h-[var(--size-touch)] flex-col items-start rounded-[var(--radius-control)] border-2 px-4 py-3 text-left ${
              method === value
                ? 'border-[var(--color-primary)] bg-[var(--color-primary-wash)]'
                : 'border-[var(--card-border)] bg-[var(--field-bg)]'
            }`}
          >
            <span className="font-semibold">{label}</span>
            <span className="text-small text-[var(--color-ink-soft)]">{hint}</span>
          </button>
        ))}
      </div>

      {state.reason && (
        <RefusalNotice title="Not set up yet" reason={state.reason} remedy={state.remedy ?? ''} />
      )}
      {state.message && !state.ok && (
        <p role="alert" className="font-semibold text-[var(--color-red)]">
          {state.message}
        </p>
      )}

      <Submit label={`Join Medwyn One · ${formatINR(price)} ${cycle === 'ANNUAL' ? 'a year' : 'a month'}`} />
      <p className="text-center text-small text-[var(--color-ink-soft)]">
        Cancel at any time from this page. No notice period, no phone call needed.
      </p>
    </form>
  );
}
