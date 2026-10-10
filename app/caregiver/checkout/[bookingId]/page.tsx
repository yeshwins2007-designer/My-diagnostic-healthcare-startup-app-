import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import { providerMode } from '@/lib/env';
import { formatINR } from '@/lib/money';
import { CheckoutForm } from '@/components/checkout-form';
import { Page } from '@/components/ui';

export const metadata: Metadata = { title: 'Secure checkout' };
export const dynamic = 'force-dynamic';

/**
 * Paying for a booking. Every amount on this screen is read from the booking
 * itself, which the booking action priced through lib/pricing: the checkout
 * never recomputes, so it cannot disagree with what was quoted.
 */
export default async function CheckoutPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const user = await requireRole('CAREGIVER');

  const booking = await db.booking.findFirst({
    where: { id: bookingId, family: { members: { some: { userId: user.id } } } },
    include: {
      patient: true,
      lab: true,
      items: { include: { panel: true, test: true } },
    },
  });
  if (!booking) notFound();
  if (booking.status !== 'AWAITING_PAYMENT') redirect(`/caregiver/visits?booked=${booking.reference}`);

  const when = booking.windowStart.toLocaleString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const waived = booking.subscriptionId && booking.collectionFeePaise === 0;

  return (
    <Page>
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Link
            href="/caregiver/book"
            aria-label="Back to booking"
            className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[var(--card-border)] text-lead"
          >
            <span aria-hidden>‹</span>
          </Link>
          <h1 className="text-h2 font-bold">Secure checkout</h1>
        </div>

        <section className="glass flex flex-col gap-3 rounded-[var(--radius-card-lg)] border-2 p-5">
          <ul className="flex flex-col gap-2">
            {booking.items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3">
                <span className="font-semibold">{item.panel?.name ?? item.test?.name}</span>
                <span className="text-lead font-bold text-[var(--color-primary)]">
                  {formatINR(item.pricePaise)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-small text-[var(--color-ink-soft)]">
            For {booking.patient.name} · {when} · {booking.lab?.name}
          </p>
        </section>

        <dl className="glass flex flex-col gap-2 rounded-[var(--radius-card-lg)] border-2 p-5">
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--color-ink-soft)]">Subtotal</dt>
            <dd>{formatINR(booking.subtotalPaise)}</dd>
          </div>
          {booking.discountPaise > 0 && (
            <div className="flex justify-between gap-3 text-[var(--color-green)]">
              <dt>Medwyn One discount</dt>
              <dd>− {formatINR(booking.discountPaise)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--color-ink-soft)]">Home collection</dt>
            <dd>{waived ? <span className="text-[var(--color-green)]">Free with Medwyn One</span> : formatINR(booking.collectionFeePaise)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t-2 border-[var(--color-line)] pt-3 text-h3 font-bold">
            <dt>Total</dt>
            <dd className="text-[var(--color-primary)]">{formatINR(booking.totalPaise)}</dd>
          </div>
        </dl>

        <CheckoutForm
          bookingId={booking.id}
          totalPaise={booking.totalPaise}
          simulated={providerMode.payments === 'simulated'}
        />
      </div>
    </Page>
  );
}
