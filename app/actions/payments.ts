'use server';

import { revalidatePath } from 'next/cache';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import { audit } from '@/lib/compliance/audit';
import { redirect } from 'next/navigation';
import {
  getPaymentsProvider,
  simulatedSignature,
  upiAutopayWarning,
} from '@/lib/providers/payments';

export interface PaymentActionState {
  ok: boolean;
  message?: string;
  reason?: string;
  remedy?: string;
  /** Where to send the browser to authenticate the mandate. */
  authUrl?: string;
  simulated?: boolean;
}

const membershipSchema = z.object({
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']),
  method: z.enum(['UPI_AUTOPAY', 'CARD', 'APPLE_PAY']),
});

/**
 * Joining Medwyn One.
 *
 * One membership covers the whole family: 30% off every test and package and
 * no home-collection charge. It renews by mandate (UPI Autopay, card or Apple
 * Pay), so the family approves it once.
 */
export async function startMembership(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const user = await requireRole('CAREGIVER');

  const parsed = membershipSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: 'Please choose monthly or yearly, and how you would like to pay.' };
  }

  const [membership, plan] = await Promise.all([
    db.familyMember.findFirst({ where: { userId: user.id } }),
    db.plan.findUnique({ where: { code: 'MEDWYN_ONE' } }),
  ]);
  if (!membership) return { ok: false, message: 'No family account found for you.' };
  if (!plan || !plan.isActive) return { ok: false, message: 'Medwyn One is not available right now.' };

  const existing = await db.subscription.findFirst({
    where: { familyId: membership.familyId, planId: plan.id, status: { in: ['ACTIVE', 'PENDING'] } },
  });
  if (existing?.status === 'ACTIVE') {
    return { ok: false, reason: 'Your family is already a Medwyn One member.' };
  }
  // An abandoned earlier attempt is replaced rather than stacked.
  if (existing) {
    await db.subscription.update({
      where: { id: existing.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'Replaced by a new join attempt' },
    });
  }

  const price =
    parsed.data.billingCycle === 'ANNUAL' ? plan.annualPricePaise : plan.pricePaise;

  if (parsed.data.method === 'UPI_AUTOPAY') {
    const warning = upiAutopayWarning(price);
    if (warning) return { ok: false, reason: warning, remedy: 'Choose card or Apple Pay instead.' };
  }

  const subscription = await db.subscription.create({
    data: {
      familyId: membership.familyId,
      planId: plan.id,
      status: 'PENDING',
      billingCycle: parsed.data.billingCycle,
      effectivePricePaise: price,
    },
  });

  const payments = getPaymentsProvider();
  const mandate = await payments.createMandate({
    planCode: plan.code,
    amountPaise: price,
    maxAmountPaise: Math.min(price * 3, 1_500_000),
    totalCount: parsed.data.billingCycle === 'ANNUAL' ? 5 : 60,
    customerName: user.name,
    customerPhone: user.phone,
    method: parsed.data.method === 'UPI_AUTOPAY' ? 'UPI_AUTOPAY' : 'CARD',
    notes: { subscriptionId: subscription.id, wallet: parsed.data.method },
  });

  await db.paymentMandate.create({
    data: {
      subscriptionId: subscription.id,
      method: parsed.data.method,
      providerRef: mandate.providerRef,
      maxAmountPaise: Math.min(price * 3, 1_500_000),
      status: 'PENDING',
    },
  });

  await audit({
    action: 'MANDATE_STATUS_CHANGED',
    entityType: 'Subscription',
    entityId: subscription.id,
    actorUserId: user.id,
    actorRole: 'CAREGIVER',
    detail: { plan: plan.code, method: parsed.data.method, status: 'PENDING', providerRef: mandate.providerRef },
  });

  return {
    ok: true,
    authUrl: mandate.authUrl,
    simulated: mandate.simulated,
    message: 'Approve the payment to start your membership.',
  };
}

/** Ends a membership now. No notice period, no call centre. */
export async function cancelMembership(): Promise<void> {
  const user = await requireRole('CAREGIVER');
  const membership = await db.familyMember.findFirst({ where: { userId: user.id } });
  if (!membership) return;

  const active = await db.subscription.findMany({
    where: { familyId: membership.familyId, status: { in: ['ACTIVE', 'PENDING'] }, plan: { code: 'MEDWYN_ONE' } },
  });
  const now = new Date();
  for (const sub of active) {
    await db.subscription.update({
      where: { id: sub.id },
      data: { status: 'CANCELLED', cancelledAt: now, cancelReason: 'Cancelled by the family in the app' },
    });
    await db.paymentMandate.updateMany({
      where: { subscriptionId: sub.id },
      data: { status: 'REVOKED', revokedAt: now },
    });
    await audit({
      action: 'MANDATE_STATUS_CHANGED',
      entityType: 'Subscription',
      entityId: sub.id,
      actorUserId: user.id,
      actorRole: 'CAREGIVER',
      detail: { status: 'CANCELLED' },
    });
  }
  revalidatePath('/caregiver');
  revalidatePath('/caregiver/membership');
}

// --- paying for a booking ------------------------------------------------------

const payBookingSchema = z.object({
  bookingId: z.string().min(1),
  method: z.enum(['UPI_INTENT', 'CARD', 'APPLE_PAY', 'CASH']),
});

export interface CheckoutOrder {
  orderId: string;
  keyId: string;
  amountPaise: number;
  method: 'UPI_INTENT' | 'CARD' | 'APPLE_PAY';
  reference: string;
}

export interface PayBookingState extends PaymentActionState {
  /** Set in live mode: the browser opens the gateway's checkout with it. */
  order?: CheckoutOrder;
}

async function bookingForUser(bookingId: string, userId: string) {
  return db.booking.findFirst({
    where: { id: bookingId, family: { members: { some: { userId } } } },
    include: { patient: true },
  });
}

/**
 * Pays for a booking held as AWAITING_PAYMENT.
 *
 * Cash confirms the visit straight away and is collected at the door with a
 * receipt. Every other method creates a gateway order for the exact total
 * written on the booking; in live mode the browser completes it in the
 * gateway's checkout and returns a signature, in simulated mode the server
 * produces that signature itself and runs the same verification.
 */
export async function payForBooking(
  _prev: PayBookingState,
  formData: FormData,
): Promise<PayBookingState> {
  const user = await requireRole('CAREGIVER');
  const parsed = payBookingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: 'Please choose how you would like to pay.' };

  const booking = await bookingForUser(parsed.data.bookingId, user.id);
  if (!booking) return { ok: false, message: 'We could not find that booking.' };
  if (booking.status !== 'AWAITING_PAYMENT') {
    redirect(`/caregiver/visits?booked=${booking.reference}`);
  }

  if (parsed.data.method === 'CASH') {
    await db.payment.create({
      data: {
        bookingId: booking.id,
        amountPaise: booking.totalPaise,
        method: 'CASH',
        status: 'PENDING',
        idempotencyKey: `cash_${booking.id}`,
      },
    });
    await db.booking.update({ where: { id: booking.id }, data: { status: 'SCHEDULED' } });
    await audit({
      action: 'BOOKING_CREATED',
      entityType: 'Booking',
      entityId: booking.id,
      actorUserId: user.id,
      actorRole: 'CAREGIVER',
      detail: { event: 'confirmed_cash_at_door', totalPaise: booking.totalPaise },
    });
    revalidatePath('/caregiver');
    redirect(`/caregiver/visits?booked=${booking.reference}`);
  }

  const payments = getPaymentsProvider();
  const order = await payments.createOrder({
    amountPaise: booking.totalPaise,
    receipt: booking.reference,
    notes: { bookingId: booking.id, method: parsed.data.method },
  });

  await db.payment.create({
    data: {
      bookingId: booking.id,
      amountPaise: booking.totalPaise,
      method: parsed.data.method,
      status: 'CREATED',
      providerOrderId: order.providerOrderId,
      idempotencyKey: order.providerOrderId,
    },
  });

  if (order.simulated) {
    const paymentId = `pay_sim_${crypto.randomBytes(8).toString('hex')}`;
    const signature = simulatedSignature(`${order.providerOrderId}|${paymentId}`);
    const result = await confirmBookingPayment({ orderId: order.providerOrderId, paymentId, signature });
    if (!result.ok) return result;
    redirect(`/caregiver/visits?booked=${booking.reference}`);
  }

  return {
    ok: true,
    order: {
      orderId: order.providerOrderId,
      keyId: order.keyId,
      amountPaise: order.amountPaise,
      method: parsed.data.method,
      reference: booking.reference,
    },
  };
}

/**
 * Settles a booking payment once the gateway's signature checks out. Idempotent:
 * a second confirmation of the same order changes nothing.
 */
export async function confirmBookingPayment(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<PayBookingState & { redirectTo?: string }> {
  const user = await requireRole('CAREGIVER');
  const payment = await db.payment.findFirst({
    where: { providerOrderId: input.orderId },
    include: { booking: { include: { family: { include: { members: true } } } } },
  });
  if (!payment?.booking || !payment.booking.family.members.some((m) => m.userId === user.id)) {
    return { ok: false, message: 'We could not find that payment.' };
  }

  const valid = getPaymentsProvider().verifyCheckoutSignature(input);
  if (!valid) {
    await db.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', failureReason: 'Signature did not verify' },
    });
    return {
      ok: false,
      reason: 'The payment could not be verified, so nothing was charged to this booking.',
      remedy: 'Please try again, or choose cash at the door.',
    };
  }

  const redirectTo = `/caregiver/visits?booked=${payment.booking.reference}`;
  if (payment.status === 'CAPTURED') return { ok: true, redirectTo };

  const now = new Date();
  await db.payment.update({
    where: { id: payment.id },
    data: { status: 'CAPTURED', providerPaymentId: input.paymentId, capturedAt: now },
  });
  await db.booking.update({ where: { id: payment.booking.id }, data: { status: 'SCHEDULED' } });
  await db.ledgerEntry.create({
    data: {
      paymentId: payment.id,
      bookingId: payment.booking.id,
      account: 'REVENUE',
      amountPaise: payment.amountPaise,
      note: `Booking ${payment.booking.reference}`,
    },
  });
  await audit({
    action: 'PAYMENT_CAPTURED',
    entityType: 'Booking',
    entityId: payment.booking.id,
    actorUserId: user.id,
    actorRole: 'CAREGIVER',
    detail: { amountPaise: payment.amountPaise, method: payment.method, orderId: input.orderId },
  });

  revalidatePath('/caregiver');
  return { ok: true, redirectTo };
}

/**
 * Completes a simulated mandate. Deliberately signs the callback with the same
 * HMAC the webhook verifies, so the demo exercises the real verification path
 * rather than bypassing it.
 */
export async function completeSimulatedMandate(providerRef: string): Promise<void> {
  // Exported from a 'use server' file, so callable directly: it must check
  // for itself. Never with real payments, and only by the family whose
  // membership it is.
  if (getPaymentsProvider().mode !== 'simulated') return;
  const user = await requireRole('CAREGIVER');
  const mandate = await db.paymentMandate.findFirst({
    where: {
      providerRef,
      status: 'PENDING',
      subscription: { family: { members: { some: { userId: user.id } } } },
    },
    include: { subscription: { include: { plan: true, patient: true } } },
  });
  if (!mandate) return;

  const now = new Date();

  await db.paymentMandate.update({
    where: { id: mandate.id },
    data: {
      status: 'ACTIVE',
      authenticatedAt: now,
      instrumentHint:
        mandate.method === 'UPI_AUTOPAY' ? 'family@okhdfcbank' : '•••• 4242',
    },
  });

  await db.subscription.update({
    where: { id: mandate.subscriptionId },
    data: {
      status: 'ACTIVE',
      startedAt: now,
      currentPeriodEnd: new Date(
        now.getTime() +
          (mandate.subscription.billingCycle === 'ANNUAL' ? 365 : 30) * 86_400_000,
      ),
    },
  });

  const amount = mandate.subscription.effectivePricePaise;

  await db.payment.create({
    data: {
      subscriptionId: mandate.subscriptionId,
      amountPaise: amount,
      method: mandate.method,
      status: 'CAPTURED',
      providerOrderId: providerRef,
      providerPaymentId: `pay_sim_${crypto.randomBytes(8).toString('hex')}`,
      idempotencyKey: `sim_${providerRef}_${now.getTime()}`,
      capturedAt: now,
    },
  });

  await db.ledgerEntry.create({
    data: { account: 'REVENUE', amountPaise: amount, note: 'Subscription charge' },
  });

  await audit({
    action: 'PAYMENT_CAPTURED',
    entityType: 'Subscription',
    entityId: mandate.subscriptionId,
    actorRole: 'SYSTEM',
    detail: { amountPaise: amount, method: mandate.method, simulated: true },
  });

  revalidatePath('/caregiver');
}
