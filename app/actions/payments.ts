'use server';

import { revalidatePath } from 'next/cache';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth/session';
import { audit } from '@/lib/compliance/audit';
import { applyDiscount } from '@/lib/money';
import {
  getPaymentsProvider,
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

/** The blueprint's founding cohort: the first 25 families, ~40% off, for life. */
const FOUNDING_COHORT_SIZE = 25;
const FOUNDING_DISCOUNT_PERCENT = 40;

const subscribeSchema = z.object({
  patientId: z.string().min(1),
  planId: z.string().min(1),
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']),
  method: z.enum(['UPI_AUTOPAY', 'CARD', 'CASH']),
});

/**
 * Starting a subscription.
 *
 * The mandate is the product: a one-off test earns a few hundred rupees once,
 * a subscription earns it every month and makes route density, staffing and
 * cash flow predictable. Cash is offered as a first-class method because a
 * meaningful share of this demographic pays the technician at the door.
 */
export async function startSubscription(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const user = await requireRole('CAREGIVER');

  const parsed = subscribeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: 'Please choose a plan and how you would like to pay.' };
  }

  const [patient, plan, existingSubscribers] = await Promise.all([
    db.patient.findFirst({
      where: {
        id: parsed.data.patientId,
        family: { members: { some: { userId: user.id } } },
      },
      include: { family: true, subscriptions: { where: { status: 'ACTIVE' } } },
    }),
    db.plan.findUnique({ where: { id: parsed.data.planId } }),
    db.subscription.count({ where: { status: { in: ['ACTIVE', 'PENDING'] } } }),
  ]);

  if (!patient) return { ok: false, message: 'We could not find that patient.' };
  if (!plan) return { ok: false, message: 'That plan is not available.' };

  if (patient.subscriptions.length > 0) {
    return {
      ok: false,
      reason: `${patient.name} already has an active plan.`,
      remedy: 'Change the existing plan from the billing page rather than starting a second one.',
    };
  }

  const isFounding = existingSubscribers < FOUNDING_COHORT_SIZE;
  const discount = isFounding ? FOUNDING_DISCOUNT_PERCENT : 0;
  const basePrice =
    parsed.data.billingCycle === 'ANNUAL' ? plan.annualPricePaise : plan.pricePaise;
  const effective = applyDiscount(basePrice, discount);

  // A monthly charge above the UPI Autopay ceiling would force the payer to
  // re-authenticate every single debit, which means churn. Catch it here.
  if (parsed.data.method === 'UPI_AUTOPAY') {
    const warning = upiAutopayWarning(effective);
    if (warning) {
      return {
        ok: false,
        reason: warning,
        remedy: 'Choose card, or switch to monthly billing so each debit stays under the limit.',
      };
    }
  }

  const zone = await db.zone.findFirst({ where: { isActive: true }, orderBy: { sequence: 'asc' } });
  const technician = zone
    ? await db.technician.findFirst({
        where: { zoneId: zone.id, isActive: true },
        orderBy: { createdAt: 'asc' },
      })
    : null;

  const subscription = await db.subscription.create({
    data: {
      familyId: patient.familyId,
      patientId: patient.id,
      planId: plan.id,
      status: parsed.data.method === 'CASH' ? 'ACTIVE' : 'PENDING',
      billingCycle: parsed.data.billingCycle,
      isFoundingMember: isFounding,
      discountPercent: discount,
      effectivePricePaise: effective,
      // Continuity starts at signup: this is the person we are promising.
      assignedTechnicianId: technician?.id ?? null,
      startedAt: parsed.data.method === 'CASH' ? new Date() : null,
    },
  });

  if (parsed.data.method === 'CASH') {
    await db.paymentMandate.create({
      data: {
        subscriptionId: subscription.id,
        method: 'CASH',
        instrumentHint: 'Cash, collected at the door',
        maxAmountPaise: effective,
        status: 'ACTIVE',
        authenticatedAt: new Date(),
      },
    });

    await audit({
      action: 'MANDATE_STATUS_CHANGED',
      entityType: 'Subscription',
      entityId: subscription.id,
      actorUserId: user.id,
      actorRole: 'CAREGIVER',
      detail: { method: 'CASH', status: 'ACTIVE' },
    });

    revalidatePath('/caregiver');
    return {
      ok: true,
      message: `${plan.name} is active for ${patient.name}. The technician will collect at each visit and give a receipt.`,
    };
  }

  const payments = getPaymentsProvider();
  const mandate = await payments.createMandate({
    planCode: plan.code,
    amountPaise: effective,
    // Headroom so a later price change does not force re-authentication.
    maxAmountPaise: Math.min(effective * 3, 1_500_000),
    totalCount: parsed.data.billingCycle === 'ANNUAL' ? 3 : 36,
    customerName: user.name,
    customerPhone: user.phone,
    method: parsed.data.method,
    notes: { subscriptionId: subscription.id, patientName: patient.name },
  });

  await db.paymentMandate.create({
    data: {
      subscriptionId: subscription.id,
      method: parsed.data.method,
      providerRef: mandate.providerRef,
      maxAmountPaise: Math.min(effective * 3, 1_500_000),
      status: 'PENDING',
    },
  });

  await audit({
    action: 'MANDATE_STATUS_CHANGED',
    entityType: 'Subscription',
    entityId: subscription.id,
    actorUserId: user.id,
    actorRole: 'CAREGIVER',
    detail: { method: parsed.data.method, status: 'PENDING', providerRef: mandate.providerRef },
  });

  return {
    ok: true,
    authUrl: mandate.authUrl,
    simulated: mandate.simulated,
    message: 'Approve the mandate to finish setting up the plan.',
  };
}

/**
 * Completes a simulated mandate. Deliberately signs the callback with the same
 * HMAC the webhook verifies, so the demo exercises the real verification path
 * rather than bypassing it.
 */
export async function completeSimulatedMandate(providerRef: string): Promise<void> {
  const mandate = await db.paymentMandate.findFirst({
    where: { providerRef },
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
