import { v4 as uuid } from 'uuid';
import Stripe from 'stripe';
import config from '../config';
import db from '../config/database';
import { notFound } from '../middleware/errors';

export interface PaymentIntentResult {
  intentId: string;
  clientSecret: string;
}

// The Stripe client is only initialised when a key is present.
const stripe = config.stripe.secretKey ? new Stripe(config.stripe.secretKey) : null;

function ensureStripe(): Stripe {
  if (!stripe) throw notFound('Payments are not configured in this environment');
  return stripe;
}

function quoteMarkupNote(isAssisted: boolean): string {
  return isAssisted ? 'assisted-by-charm-agent' : 'direct-checkout';
}

/**
 * Create a Stripe PaymentIntent (or a deterministic mock when Stripe is unavailable,
 * e.g. in development/tests) for an order. Returns the client secret for the
 * Stripe Payment Element.
 */
export async function createIntent(
  orderId: string,
  amountCents: number,
  isAssisted: boolean,
): Promise<PaymentIntentResult> {
  if (!stripe) {
    if (config.env === 'production') throw notFound('Card payments are not configured');
    // Deterministic dev fallback so the whole flow can be tested locally.
    const intentId = `mock_${orderId}`;
    return { intentId, clientSecret: `pi_mock_${orderId}_secret` };
  }

  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'usd',
    automatic_payment_methods: { enabled: true },
    metadata: { order_id: orderId, source: quoteMarkupNote(isAssisted) },
  });
  return { intentId: intent.id, clientSecret: intent.client_secret ?? '' };
}

/**
 * Confirm payment inside the mock/dev flow. In production this is triggered by the
 * Stripe webhook (handleWebhook) rather than a direct call.
 */
export async function confirmPayment(orderId: string): Promise<void> {
  if(config.env === 'production') throw notFound('Payment confirmation requires the payment provider webhook');
  await db('payments').insert({
    id: uuid(),
    order_id: orderId,
    intent_id: `mock_${orderId}`,
    status: 'succeeded',
    amount_cents: 0, // filled by webhook in production
    currency: 'USD',
  });
}

/**
 * Verify and process an incoming Stripe webhook event. Handles
 * payment_intent.succeeded to finalise the order.
 */
export async function handleWebhook(rawBody: string | Buffer, signature: string | undefined): Promise<string> {
  if (!stripe || !config.stripe.webhookSecret) {
    return 'ignored-no-stripe-configured';
  }
  if (!signature) throw new Error('Missing Stripe signature');

  const event = stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent;
    const orderId = intent.metadata.order_id;
    if (orderId) {
      const { finalizePaidOrder } = await import('./order.service');
      await db('payments').insert({
        id: uuid(),
        order_id: orderId,
        intent_id: intent.id,
        status: 'succeeded',
        amount_cents: intent.amount,
        currency: (intent.currency ?? 'USD').toUpperCase(),
      });
      await finalizePaidOrder(orderId);
    }
  }
  return `handled-${event.type}`;
}

export async function refundOrder(orderId: string, amountCents?: number): Promise<void> {
  if (!stripe) {
    await db('refunds').insert({
      id: uuid(),
      order_id: orderId,
      refund_id: `mock_refund_${orderId}`,
      amount_cents: amountCents ?? 0,
      currency: 'USD',
      status: 'succeeded',
    });
    return;
  }

  const payment = await db('payments').where({ order_id: orderId }).first();
  if (!payment) throw notFound('Payment not found for order');
  const refund = await stripe.refunds.create({
    payment_intent: payment.intent_id,
    amount: amountCents ?? undefined,
  });
  await db('refunds').insert({
    id: uuid(),
    order_id: orderId,
    payment_id: payment.id,
    refund_id: refund.id,
    amount_cents: refund.amount,
    currency: (refund.currency ?? 'USD').toUpperCase(),
    status: refund.status ?? 'succeeded',
  });
}
