import { v4 as uuid } from 'uuid';
import db from '../config/database';

export type NotificationType =
  | 'order_confirmed'
  | 'order_shipped'
  | 'order_delivered'
  | 'order_refunded'
  | 'production_ready'
  | 'low_stock';

/**
 * Enqueue an outbox event within (or shortly after) the business transaction.
 * A relay worker then delivers it async (email/SMS) at-least-once.
 */
export async function enqueueNotification(
  type: NotificationType,
  payload: Record<string, unknown>,
): Promise<void> {
  await db('outbox').insert({
    id: uuid(),
    type,
    payload: JSON.stringify(payload),
    status: 'pending',
    attempts: 0,
  });
}

/**
 * Relay worker: deliver pending outbox events.
 */
export async function relayOutbox(batchSize = 10): Promise<number> {
  const pending = await db('outbox').where({ status: 'pending' }).orderBy('created_at').limit(batchSize);
  let delivered = 0;
  for (const ev of pending as any[]) {
    try {
      const payload = JSON.parse(ev.payload);
      // eslint-disable-next-line no-console
      console.log(`[notify:${ev.type}]`, JSON.stringify(payload));
      await db('outbox').where({ id: ev.id }).update({ status: 'published' });
      delivered += 1;
    } catch (e) {
      await db('outbox').where({ id: ev.id }).update({
        attempts: (ev.attempts ?? 0) + 1,
        status: Number(ev.attempts ?? 0) >= 3 ? 'failed' : 'pending',
      });
    }
  }
  return delivered;
}

/**
 * Send a WhatsApp message via the Meta Cloud API (free tier: 1000 messages/month).
 *
 * Requires env vars:
 *   WHATSAPP_PHONE_NUMBER_ID  — from Meta Developer Console > WhatsApp > Quickstart
 *   WHATSAPP_ACCESS_TOKEN     — permanent access token from Meta Business Suite
 *
 * The `to` number must include country code (e.g. "263771234567" for Zimbabwe).
 */
export async function sendWhatsApp(to: string, body: string): Promise<{ sent: boolean; to: string }> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    // eslint-disable-next-line no-console
    console.log(`[whatsapp:dev] to=${to} ::${body}`);
    return { sent: false, to };
  }

  // Normalize: strip spaces, dashes, leading +
  const cleanTo = to.replace(/[\s\-\(\)\+]/g, '');

  try {
    const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: cleanTo,
        type: 'text',
        text: { body },
      }),
    });
    const result = await resp.json() as { messages?: Array<{ id: string }>; error?: { message: string; code: number } };
    if (!resp.ok || !result.messages?.length) {
      // eslint-disable-next-line no-console
      console.error('[whatsapp] FAILED', resp.status, result.error?.message ?? JSON.stringify(result));
      return { sent: false, to };
    }
    // eslint-disable-next-line no-console
    console.log(`[whatsapp] OK id=${result.messages[0].id} to=${cleanTo}`);
    return { sent: true, to: cleanTo };
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('[whatsapp] ERROR', e?.message ?? e);
    return { sent: false, to };
  }
}

/**
 * Send an order confirmation — tries WhatsApp first, falls back to Twilio SMS.
 */
export async function sendOrderConfirmation(
  to: string,
  orderNumber: string,
  total: number,
  customerName?: string,
): Promise<void> {
  const greeting = customerName ? `Hi ${customerName}` : 'Hi there';
  const body = [
    `${greeting}! 🛒`,
    '',
    `Your HUWA TABLE CHARM order *${orderNumber}* is confirmed.`,
    `Total: *$${total.toFixed(2)}*`,
    '',
    'Track your order anytime on our website.',
    'Thank you for shopping with us! 🙏',
  ].join('\n');

  // Try WhatsApp first (free)
  const wa = await sendWhatsApp(to, body);
  if (wa.sent) return;

  // Fall back to Twilio SMS if configured
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (accountSid && authToken && fromNumber) {
    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const params = new URLSearchParams();
      params.append('To', to);
      params.append('From', fromNumber);
      params.append('Body', body.replace(/\*/g, '')); // Twilio doesn't support bold markdown

      const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      const result = await resp.json() as { sid?: string; error_message?: string };
      if (!resp.ok || !result.sid) {
        // eslint-disable-next-line no-console
        console.error('[sms:twilio] FAILED', resp.status, result.error_message ?? JSON.stringify(result));
      } else {
        // eslint-disable-next-line no-console
        console.log(`[sms:twilio] OK sid=${result.sid} to=${to}`);
      }
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('[sms:twilio] ERROR', e?.message ?? e);
    }
  }
}
