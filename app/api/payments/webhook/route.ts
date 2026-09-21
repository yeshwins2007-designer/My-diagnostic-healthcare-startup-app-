import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { audit } from '@/lib/compliance/audit';
import { getPaymentsProvider } from '@/lib/providers/payments';

/**
 * Razorpay webhook.
 *
 * Three things this endpoint must get right, because money and access both
 * depend on it:
 *
 *   1. Verify the signature against the RAW body. Parsing first and
 *      re-serialising changes the bytes and the HMAC will never match.
 *   2. Be idempotent. Razorpay retries, and a duplicate delivery must not
 *      double-credit a subscription or write the ledger twice.
 *   3. Never trust the amount in the payload over our own record of what the
 *      subscription costs.
 */

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature =
    request.headers.get('x-razorpay-signature') ??
    request.headers.get('x-simulated-signature') ??
    '';

  const payments = getPaymentsProvider();
  const verification = payments.verifyWebhook(rawBody, signature);

  if (!verification.valid) {
    // Deliberately terse: an attacker learns nothing from the response.
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  let event: {
    event?: string;
    payload?: {
      payment?: { entity?: { id?: string; order_id?: string; amount?: number; status?: string } };
      subscription?: { entity?: { id?: string; status?: string } };
    };
  };

  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Malformed body.' }, { status: 400 });
  }

  const eventType = event.event ?? 'unknown';
  const payment = event.payload?.payment?.entity;
  const subscriptionEntity = event.payload?.subscription?.entity;

  switch (eventType) {
    case 'payment.captured': {
      if (!payment?.id) break;

      // Idempotency: the provider payment id is unique in our schema, so a
      // retried delivery collides instead of double-crediting.
      const existing = await db.payment.findUnique({
        where: { providerPaymentId: payment.id },
      });
      if (existing) {
        return NextResponse.json({ ok: true, deduplicated: true });
      }

      const mandate = payment.order_id
        ? await db.paymentMandate.findFirst({
            where: { providerRef: payment.order_id },
            include: { subscription: true },
          })
        : null;

      // Our record of the price wins over whatever arrives in the payload.
      const amountPaise = mandate?.subscription.effectivePricePaise ?? payment.amount ?? 0;

      await db.payment.create({
        data: {
          subscriptionId: mandate?.subscriptionId ?? null,
          amountPaise,
          method: mandate?.method ?? 'UPI_AUTOPAY',
          status: 'CAPTURED',
          providerOrderId: payment.order_id ?? null,
          providerPaymentId: payment.id,
          idempotencyKey: `rzp_${payment.id}`,
          capturedAt: new Date(),
        },
      });

      await db.ledgerEntry.create({
        data: { account: 'REVENUE', amountPaise, note: `Razorpay ${payment.id}` },
      });

      await audit({
        action: 'PAYMENT_CAPTURED',
        entityType: 'Payment',
        entityId: payment.id,
        actorRole: 'SYSTEM',
        detail: { amountPaise, eventType },
      });
      break;
    }

    case 'payment.failed': {
      if (!payment?.id) break;
      await db.payment.updateMany({
        where: { providerPaymentId: payment.id },
        data: { status: 'FAILED', failureReason: 'Reported failed by the gateway' },
      });
      break;
    }

    case 'subscription.activated':
    case 'subscription.charged': {
      if (!subscriptionEntity?.id) break;
      const mandate = await db.paymentMandate.findFirst({
        where: { providerRef: subscriptionEntity.id },
      });
      if (!mandate) break;

      await db.paymentMandate.update({
        where: { id: mandate.id },
        data: { status: 'ACTIVE', authenticatedAt: mandate.authenticatedAt ?? new Date() },
      });
      await db.subscription.update({
        where: { id: mandate.subscriptionId },
        data: { status: 'ACTIVE', startedAt: new Date() },
      });

      await audit({
        action: 'MANDATE_STATUS_CHANGED',
        entityType: 'Subscription',
        entityId: mandate.subscriptionId,
        actorRole: 'SYSTEM',
        detail: { eventType, providerRef: subscriptionEntity.id },
      });
      break;
    }

    case 'subscription.halted':
    case 'subscription.cancelled': {
      if (!subscriptionEntity?.id) break;
      const mandate = await db.paymentMandate.findFirst({
        where: { providerRef: subscriptionEntity.id },
      });
      if (!mandate) break;

      await db.paymentMandate.update({
        where: { id: mandate.id },
        data: {
          status: eventType === 'subscription.cancelled' ? 'REVOKED' : 'PAUSED',
          revokedAt: eventType === 'subscription.cancelled' ? new Date() : null,
        },
      });
      // A failed mandate must never silently stop the visits — it becomes a
      // conversation with the family, not a quiet cancellation.
      await db.subscription.update({
        where: { id: mandate.subscriptionId },
        data: { status: eventType === 'subscription.cancelled' ? 'CANCELLED' : 'PAST_DUE' },
      });

      await audit({
        action: 'MANDATE_STATUS_CHANGED',
        entityType: 'Subscription',
        entityId: mandate.subscriptionId,
        actorRole: 'SYSTEM',
        detail: { eventType },
      });
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ ok: true });
}
