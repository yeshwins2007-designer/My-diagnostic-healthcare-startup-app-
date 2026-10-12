'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  confirmBookingPayment,
  payForBooking,
  type CheckoutOrder,
  type PayBookingState,
} from '@/app/actions/payments';
import { formatINR } from '@/lib/money';
import { Button, RefusalNotice } from '@/components/ui';

type Method = 'UPI_INTENT' | 'CARD' | 'APPLE_PAY' | 'CASH';

const METHODS: { value: Method; label: string; hint: string }[] = [
  { value: 'UPI_INTENT', label: 'UPI', hint: 'Google Pay, PhonePe, Paytm or any UPI app' },
  { value: 'CARD', label: 'Card', hint: 'Debit or credit card' },
  { value: 'APPLE_PAY', label: 'Apple Pay', hint: 'Pay with Face ID or Touch ID' },
  { value: 'CASH', label: 'Cash at the door', hint: 'Pay the technician; you get a receipt' },
];

declare global {
  interface Window {
    ApplePaySession?: { canMakePayments?: () => boolean };
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

/** Card art: an obsidian card on the hairline grid, no gradients. */
function CardArt() {
  return (
    <div
      aria-hidden
      className="brand-surface relative h-36 overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line-strong)] p-4"
    >
      <div className="relative flex h-full flex-col justify-between">
        <span className="eyebrow self-end">Debit / credit</span>
        <span className="h-7 w-10 rounded-md border border-[var(--color-line-strong)] bg-[var(--color-primary-wash)]" />
        <span className="font-mono text-small tracking-[0.2em] text-[var(--color-ink-soft)]">•••• •••• •••• ••••</span>
      </div>
    </div>
  );
}

function ApplePayButton({ total }: { total: number }) {
  const { pending } = useFormStatus();
  const [native, setNative] = useState(false);
  useEffect(() => {
    // Safari draws the real Apple Pay button from CSS; elsewhere we draw one.
    setNative(typeof window !== 'undefined' && !!window.ApplePaySession);
  }, []);
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={`Pay ${formatINR(total)} with Apple Pay`}
      className="flex min-h-[var(--size-touch)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-white/20 bg-black px-6 font-medium text-white disabled:opacity-60"
      style={
        native
          ? ({
              WebkitAppearance: '-apple-pay-button',
              ApplePayButtonType: 'buy',
              ApplePayButtonStyle: 'white-outline',
            } as React.CSSProperties)
          : undefined
      }
    >
      {!native && (pending ? 'Opening Apple Pay…' : <>Apple Pay · {formatINR(total)}</>)}
    </button>
  );
}

function PayButton({ total, method }: { total: number; method: Method }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" full disabled={pending}>
      {pending ? 'Processing…' : method === 'CASH' ? 'Confirm booking' : `Pay now · ${formatINR(total)}`}
    </Button>
  );
}

/** Opens the gateway's own checkout for a live order and settles it on success. */
function useGatewayCheckout(order: CheckoutOrder | undefined, onError: (m: string) => void) {
  const router = useRouter();
  useEffect(() => {
    if (!order) return;
    const open = () => {
      if (!window.Razorpay) return onError('The payment window could not load. Please try again.');
      const rzp = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: 'INR',
        name: 'MEDWYN',
        description: `Booking ${order.reference}`,
        method: order.method === 'UPI_INTENT' ? { upi: true } : undefined,
        handler: async (r: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          const result = await confirmBookingPayment({
            orderId: r.razorpay_order_id,
            paymentId: r.razorpay_payment_id,
            signature: r.razorpay_signature,
          });
          if (result.ok && result.redirectTo) router.push(result.redirectTo);
          else onError(result.reason ?? result.message ?? 'The payment could not be verified.');
        },
      });
      rzp.open();
    };
    if (window.Razorpay) return open();
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = open;
    script.onerror = () => onError('The payment window could not load. Please try again.');
    document.body.appendChild(script);
  }, [order, onError, router]);
}

export function CheckoutForm({
  bookingId,
  totalPaise,
  simulated,
}: {
  bookingId: string;
  totalPaise: number;
  simulated: boolean;
}) {
  const [method, setMethod] = useState<Method>('UPI_INTENT');
  const [error, setError] = useState<string | null>(null);
  const [state, action] = useActionState<PayBookingState, FormData>(payForBooking, { ok: false });
  useGatewayCheckout(state.order, setError);

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="method" value={method} />

      <section className="glass flex flex-col gap-4 rounded-[var(--radius-card-lg)] border p-5">
        <h2 className="text-h3 font-semibold">Payment method</h2>
        {method === 'CARD' && <CardArt />}
        <div role="radiogroup" aria-label="Payment method" className="grid gap-3">
          {METHODS.map((m) => {
            const on = method === m.value;
            return (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setMethod(m.value)}
                className={`flex min-h-[var(--size-touch)] items-center gap-4 rounded-[var(--radius-control)] border px-4 py-3 text-left ${
                  on
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-wash)]'
                    : 'border-[var(--card-border)] bg-[var(--field-bg)]'
                }`}
              >
                <span
                  aria-hidden
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                    on ? 'border-[var(--color-primary)]' : 'border-[var(--color-line-strong)]'
                  }`}
                >
                  {on && <span className="h-3 w-3 rounded-full bg-[var(--color-primary)]" />}
                </span>
                <span className="flex flex-col">
                  <span className="font-semibold">{m.label}</span>
                  <span className="text-small text-[var(--color-ink-soft)]">{m.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {(state.reason || error) && (
        <RefusalNotice
          title="Payment not completed"
          reason={error ?? state.reason ?? ''}
          remedy={state.remedy ?? 'Please try again, or choose cash at the door.'}
        />
      )}
      {state.message && !state.ok && (
        <p role="alert" className="font-semibold text-[var(--color-red)]">
          {state.message}
        </p>
      )}

      {method === 'APPLE_PAY' ? (
        <ApplePayButton total={totalPaise} />
      ) : (
        <PayButton total={totalPaise} method={method} />
      )}

      <p className="flex items-center justify-center gap-2 text-center text-small text-[var(--color-ink-soft)]">
        <svg aria-hidden viewBox="0 0 24 24" width="18" height="18">
          <path
            d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M8.5 12l2.5 2.5 4.5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {simulated
          ? 'Demo mode: payments are simulated and no money moves.'
          : 'Payments are processed by Razorpay. We never see your card or UPI PIN.'}
      </p>
    </form>
  );
}
