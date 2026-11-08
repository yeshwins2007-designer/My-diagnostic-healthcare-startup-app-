/**
 * Payments.
 *
 * The engine of this business is a recurring mandate, not a checkout. A one-off
 * test earns a few hundred rupees once; a subscription earns it every month and
 * makes route density, staffing and cash flow predictable.
 *
 * Razorpay is used because it is the one gateway that covers UPI Autopay
 * mandates, cards and netbanking in a single integration. A monthly plan at
 * ₹1,799 sits comfortably under the ₹15,000 per-transaction ceiling above which
 * UPI Autopay requires additional factor authentication on every debit.
 *
 * Cash is a first-class method, not an afterthought: a meaningful share of this
 * exact demographic will hand notes to the technician at the door.
 */

import crypto from 'node:crypto';
import { env, providerMode } from '../../env';

export interface CreateOrderInput {
  amountPaise: number;
  /** Our own id, echoed back on the webhook so we can reconcile. */
  receipt: string;
  notes?: Record<string, string>;
}

export interface OrderResult {
  providerOrderId: string;
  amountPaise: number;
  currency: 'INR';
  /** Public key the browser checkout needs. Empty in simulated mode. */
  keyId: string;
  simulated: boolean;
}

export interface CreateMandateInput {
  planCode: string;
  /** Monthly or annual price actually being charged. */
  amountPaise: number;
  /** Headroom above the charge, so a price rise does not require re-auth. */
  maxAmountPaise: number;
  totalCount: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  method: 'UPI_AUTOPAY' | 'CARD';
  notes?: Record<string, string>;
}

export interface MandateResult {
  providerRef: string;
  /** Where the browser sends the payer to authenticate the mandate. */
  authUrl: string;
  simulated: boolean;
}

export interface WebhookVerification {
  valid: boolean;
  reason?: string;
}

export interface PaymentsProvider {
  readonly mode: 'live' | 'simulated';
  createOrder(input: CreateOrderInput): Promise<OrderResult>;
  createMandate(input: CreateMandateInput): Promise<MandateResult>;
  verifyWebhook(rawBody: string, signature: string): WebhookVerification;
  /** Verifies the signature the browser checkout hands back on success. */
  verifyCheckoutSignature(input: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): boolean;
}

// --- simulated ---------------------------------------------------------------

/**
 * Signs simulated callbacks with the app's own secret, so the verification
 * path exercised in demo mode is the same code path as production rather than
 * a bypass. A simulator that skips signature checks teaches you nothing.
 */
const SIM_SECRET = 'simulated-razorpay-secret';

export function simulatedSignature(payload: string): string {
  return crypto.createHmac('sha256', SIM_SECRET).update(payload).digest('hex');
}

class SimulatedPaymentsProvider implements PaymentsProvider {
  readonly mode = 'simulated' as const;

  async createOrder(input: CreateOrderInput): Promise<OrderResult> {
    return {
      providerOrderId: `order_sim_${crypto.randomBytes(8).toString('hex')}`,
      amountPaise: input.amountPaise,
      currency: 'INR',
      keyId: '',
      simulated: true,
    };
  }

  async createMandate(input: CreateMandateInput): Promise<MandateResult> {
    const ref = `sub_sim_${crypto.randomBytes(8).toString('hex')}`;
    return {
      providerRef: ref,
      // An in-app page that mimics the UPI Autopay approval sheet.
      authUrl: `/checkout/simulated/${ref}?amount=${input.amountPaise}&method=${input.method}`,
      simulated: true,
    };
  }

  verifyWebhook(rawBody: string, signature: string): WebhookVerification {
    const expected = simulatedSignature(rawBody);
    if (expected.length !== signature.length) {
      return { valid: false, reason: 'Signature length mismatch.' };
    }
    const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    return valid ? { valid: true } : { valid: false, reason: 'Signature did not match.' };
  }

  verifyCheckoutSignature(input: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): boolean {
    const expected = simulatedSignature(`${input.orderId}|${input.paymentId}`);
    return expected === input.signature;
  }
}

// --- live --------------------------------------------------------------------

class RazorpayProvider implements PaymentsProvider {
  readonly mode = 'live' as const;

  private authHeader(): string {
    const raw = `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`;
    return `Basic ${Buffer.from(raw).toString('base64')}`;
  }

  private async call<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`https://api.razorpay.com/v1/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Razorpay ${path} failed (${res.status}): ${detail}`);
    }
    return (await res.json()) as T;
  }

  async createOrder(input: CreateOrderInput): Promise<OrderResult> {
    const order = await this.call<{ id: string; amount: number }>('orders', {
      amount: input.amountPaise,
      currency: 'INR',
      receipt: input.receipt,
      notes: input.notes ?? {},
    });

    return {
      providerOrderId: order.id,
      amountPaise: order.amount,
      currency: 'INR',
      keyId: env.RAZORPAY_KEY_ID ?? '',
      simulated: false,
    };
  }

  async createMandate(input: CreateMandateInput): Promise<MandateResult> {
    // A Razorpay subscription carries the mandate. `customer_notify: 0` because
    // *we* send the reminders, in the family's own language and wording.
    const subscription = await this.call<{ id: string; short_url: string }>(
      'subscriptions',
      {
        plan_id: input.planCode,
        total_count: input.totalCount,
        customer_notify: 0,
        // Headroom so a future price change does not force re-authentication.
        addons: [],
        notes: {
          ...(input.notes ?? {}),
          customer_name: input.customerName,
          customer_phone: input.customerPhone,
          max_amount_paise: String(input.maxAmountPaise),
          preferred_method: input.method,
        },
      },
    );

    return {
      providerRef: subscription.id,
      authUrl: subscription.short_url,
      simulated: false,
    };
  }

  verifyWebhook(rawBody: string, signature: string): WebhookVerification {
    const secret = env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      return { valid: false, reason: 'RAZORPAY_WEBHOOK_SECRET is not configured.' };
    }
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    if (expected.length !== signature.length) {
      return { valid: false, reason: 'Signature length mismatch.' };
    }
    const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    return valid ? { valid: true } : { valid: false, reason: 'Signature did not match.' };
  }

  verifyCheckoutSignature(input: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): boolean {
    const expected = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET ?? '')
      .update(`${input.orderId}|${input.paymentId}`)
      .digest('hex');
    if (expected.length !== input.signature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(input.signature));
  }
}

let cached: PaymentsProvider | null = null;

export function getPaymentsProvider(): PaymentsProvider {
  if (!cached) {
    cached =
      providerMode.payments === 'live'
        ? new RazorpayProvider()
        : new SimulatedPaymentsProvider();
  }
  return cached;
}

/**
 * UPI Autopay debits above this amount require additional factor
 * authentication on every single charge — which for a monthly subscription
 * means the family re-approving every month, which means churn. Every plan
 * price is validated against it.
 */
export const UPI_AUTOPAY_NO_AFA_CEILING_PAISE = 1_500_000; // ₹15,000

export function upiAutopayWarning(amountPaise: number): string | null {
  if (amountPaise > UPI_AUTOPAY_NO_AFA_CEILING_PAISE) {
    return `₹${(amountPaise / 100).toLocaleString('en-IN')} is above the ₹15,000 UPI Autopay threshold, so the payer must authenticate every debit. Split the plan or bill annually by card instead.`;
  }
  return null;
}
