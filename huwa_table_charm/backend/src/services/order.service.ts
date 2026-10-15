import {assertPurchasable} from './purchase-guard';
import { v4 as uuid } from 'uuid';
import db from '../config/database';
import { getCart } from './cart.service';
import { toVariant, toCents, cents, type VariantRow } from './catalog.mapper';
import { quoteShipping, type ShippingLine } from './shipping.service';
import * as notification from './notification.service';
import * as paymentService from './payment.service';
import { ORDER_TRANSITIONS, type OrderState, type OrderDto, type OrderEventDto } from '@huwa/shared';
import { badRequest, notFound } from '../middleware/errors';

interface OrderRow {
  id: string;
  order_number: string;
  user_id: string | null;
  state: OrderState;
  subtotal_cents: number;
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  shipping_address: unknown;
  shipping_option: unknown;
  is_assisted: boolean;
  payment_intent_id: string | null;
  payment_method: 'card' | 'whatsapp' | 'bank' | 'ecocash' | null;
  created_at: string;
  updated_at: string;
}

interface OrderItemRow {
  id: string;
  order_id: string;
  variant_id: string;
  sku: string;
  title: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  fulfilment_mode: string;
}

function assertTransition(from: OrderState, to: OrderState): void {
  if (!ORDER_TRANSITIONS[from].includes(to)) {
    throw badRequest(`Cannot transition order from ${from} to ${to}`, 'INVALID_TRANSITION');
  }
}

function genOrderNumber(): string {
  return `HTC-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}`;
}

/**
 * When a logged-in user checks out, merge any items from their anonymous cart
 * into their user cart so nothing is lost.
 */
async function mergeAnonymousCart(userId: string, anonymousId: string): Promise<void> {
  const userCart = await db('carts').where({ user_id: userId }).first() as { id: string } | undefined;
  const anonCart = await db('carts').where({ anonymous_id: anonymousId }).first() as { id: string } | undefined;
  if (!anonCart || !userCart) return;
  if (anonCart.id === userCart.id) return;

  const anonItems = await db('cart_items').where({ cart_id: anonCart.id }).select('*');
  for (const item of anonItems) {
    const existing = await db('cart_items').where({ cart_id: userCart.id, variant_id: item.variant_id }).first();
    if (existing) {
      await db('cart_items').where({ id: existing.id }).update({ quantity: existing.quantity + item.quantity });
    } else {
      await db('cart_items').insert({ id: uuid(), cart_id: userCart.id, variant_id: item.variant_id, quantity: item.quantity });
    }
  }
  await db('cart_items').where({ cart_id: anonCart.id }).del();
  await db('carts').where({ id: anonCart.id }).del();
}

/**
 * Create an order from the cart (state OPEN) and return order + shipping quote.
 * The order is NOT paid yet.
 */
export async function createOrderFromCart(
  userId: string | null,
  anonymousId: string,
  shippingAddress: Record<string, string>,
  isAssisted = false,
  paymentMethod: 'card' | 'whatsapp' | 'bank' | 'ecocash' = 'card',
): Promise<{ order: OrderDto; paymentIntentSecret: string }> {
  // If user is logged in, merge any anonymous cart into their user cart
  if (userId) {
    await mergeAnonymousCart(userId, anonymousId);
  }

  const cart = await getCart(userId, anonymousId);
  if (cart.items.length === 0) throw badRequest('Cart is empty');

  // Build line items + shipping estimate
  const subtotalCents = toCents(cart.subtotal);
  const shippingLines: ShippingLine[] = [];
  const lineData: Array<{ variant: any; quantity: number; unitCents: number }> = [];

  for (const item of cart.items) {
    const variant = await db('variants').where({ id: item.variantId }).first();
    if (!variant) throw badRequest('Cart contains an outdated item');
    await assertPurchasable(variant.product_id);
    lineData.push({ variant, quantity: item.quantity, unitCents: Number(variant.price_cents) });
    shippingLines.push({
      weightKg: Number(variant.weight_kg),
      widthCm: Number(variant.width_cm),
      heightCm: Number(variant.height_cm),
      depthCm: Number(variant.depth_cm),
      quantity: item.quantity,
    });
  }
  const quote = await quoteShipping(shippingLines);
  const shippingCents = quote.priceCents;
  const taxCents = Math.round(subtotalCents * 0.08); // example VAT/sales tax 8%
  const totalCents = subtotalCents + shippingCents + taxCents;

  const orderId = uuid();
  const orderRow: OrderRow = {
    id: orderId,
    order_number: genOrderNumber(),
    user_id: userId,
    state: 'OPEN',
    subtotal_cents: subtotalCents,
    shipping_cents: shippingCents,
    tax_cents: taxCents,
    total_cents: totalCents,
    currency: 'USD',
    shipping_address: JSON.stringify(shippingAddress),
    shipping_option: JSON.stringify(quote),
    is_assisted: isAssisted,
    payment_intent_id: null,
    payment_method: paymentMethod,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await db('orders').insert(orderRow);

  for (const ld of lineData) {
    const v: any = ld.variant;
    const lineTotal = ld.unitCents * ld.quantity;
    await db('order_items').insert({
      id: uuid(),
      order_id: orderId,
      variant_id: v.id,
      sku: v.sku,
      title: v.title,
      quantity: ld.quantity,
      unit_price_cents: ld.unitCents,
      line_total_cents: lineTotal,
      fulfilment_mode: v.fulfilment_mode,
    });
  }

  await insertEvent(orderId, null, 'OPEN', 'Order created from cart');

  // Set up Stripe payment intent
  const intent = await paymentService.createIntent(orderId, totalCents, isAssisted);
  await db('orders').where({ id: orderId }).update({ payment_intent_id: intent.intentId });

  const order = await loadOrder(orderId);
  return { order, paymentIntentSecret: intent.clientSecret };
}

/**
 * Called by the Stripe webhook/confirmation once payment succeeds.
 * Marks order PAID, reserves stock, queues production jobs for make-to-order items.
 */
export async function finalizePaidOrder(orderId: string): Promise<OrderDto> {
  const order = await loadOrderOrder(orderId);
  assertTransition(order.state, 'PAID');
  await db('orders').where({ id: orderId }).update({ state: 'PAID', updated_at: new Date().toISOString() });
  await insertEvent(orderId, order.state, 'PAID', 'Payment confirmed');
  const shippingAddress = (order.shippingAddress ?? {}) as { name?: string; phone?: string };
  const phone = shippingAddress.phone;
  await notification.enqueueNotification('order_confirmed', {
    orderId,
    orderNumber: order.orderNumber,
    total: order.total,
    phone,
  });
  if (phone) {
    try {
      await notification.sendOrderConfirmation(
        phone,
        order.orderNumber,
        order.total,
        shippingAddress.name,
      );
    } catch (e: any) {
      // Notification failure must not block order finalization
      // eslint-disable-next-line no-console
      console.error('[order] Notification failed (order still finalized):', e?.message ?? e);
    }
  }

  // Reserve per line item according to fulfilment mode
  const items = await db('order_items').where({ order_id: orderId }).select('*') as OrderItemRow[];
  for (const item of items) {
    if (item.fulfilment_mode === 'stocked') {
      await reserveStocked(item);
    } else {
      await queueProduction(item);
    }
  }
  await db('carts').where({ id: order.id }).del();
  for (const item of items) {
    await db('cart_items').where({ variant_id: item.variant_id }).del();
  }
  return loadOrder(orderId);
}

async function reserveStocked(item: OrderItemRow): Promise<void> {
  const inv = await db('inventory_stock').where({ variant_id: item.variant_id }).first();
  if (!inv) return;
  const available = Number(inv.sellable);
  if (available < item.quantity) {
    // partial/backorder allowed is not implemented in v1 reserve what we can
    throw badRequest('Insufficient stock at payment time');
  }
  await db('inventory_stock')
    .where({ variant_id: item.variant_id })
    .update({
      reserved: Number(inv.reserved) + item.quantity,
      sellable: available - item.quantity,
      updated_at: new Date().toISOString(),
    });
  await db('stock_movements').insert({
    id: uuid(),
    variant_id: item.variant_id,
    order_id: item.order_id,
    type: 'reservation',
    change: -item.quantity,
    note: `Reserved for order ${item.order_id}`,
  });
}

async function queueProduction(item: OrderItemRow): Promise<void> {
  const variant = await db('variants').where({ id: item.variant_id }).first() as VariantRow;
  await db('production_jobs').insert({
    id: uuid(),
    order_item_id: item.id,
    status: 'queued',
    lead_time_days: variant.lead_time_days,
  });
}

export async function transitionOrder(
  orderId: string,
  toState: OrderState,
  note?: string,
): Promise<OrderDto> {
  const order = await loadOrderOrder(orderId);
  assertTransition(order.state, toState);
  await db('orders').where({ id: orderId }).update({ state: toState, updated_at: new Date().toISOString() });
  await insertEvent(orderId, order.state, toState, note);

  // Fulfilment side effects: completing production marks jobs done
  if (toState === 'READY') {
    const itemIds = order.items.map((i) => i.id);
    await db('production_jobs')
      .whereIn('order_item_id', itemIds)
      .whereNot({ status: 'cancelled' })
      .update({ status: 'done', completed_at: new Date().toISOString() });
  }
  if (toState === 'SHIPPED') {
    await notification.enqueueNotification('order_shipped', { orderId, orderNumber: order.orderNumber });
  }
  if (toState === 'DELIVERED') {
    await notification.enqueueNotification('order_delivered', { orderId, orderNumber: order.orderNumber });
  }
  if (toState === 'REFUNDED') {
    await notification.enqueueNotification('order_refunded', { orderId, orderNumber: order.orderNumber });
  }
  return loadOrder(orderId);
}

export async function getOrder(orderId: string): Promise<OrderDto> {
  return loadOrder(orderId);
}

export async function getOrderByNumber(orderNumber: string): Promise<OrderDto | null> {
  const row = await db('orders').where({ order_number: orderNumber }).first();
  return row ? composeOrder(row as OrderRow) : null;
}

export async function listOrdersByUser(userId: string, email?: string): Promise<OrderDto[]> {
  let query = db('orders').where(function () {
    this.where('user_id', userId);
    if (email) {
      this.orWhereRaw(db.client.config.client === 'pg' ? "shipping_address->>'email' = ?" : "json_extract(shipping_address, '$.email') = ?", [email]);
    }
  }).orderBy('created_at', 'desc');
  const rows = await query;
  const out: OrderDto[] = [];
  for (const row of rows) out.push(await composeOrder(row as OrderRow));
  return out;
}

export async function listAllOrders(limit = 50, offset = 0): Promise<{ items: OrderDto[]; total: number }> {
  const rows = await db('orders').orderBy('created_at', 'desc').limit(limit).offset(offset);
  const [countRow] = await db('orders').count('* as c');
  const items: OrderDto[] = [];
  for (const row of rows) items.push(await composeOrder(row as OrderRow));
  return { items, total: Number((countRow as any).c ?? 0) };
}

async function loadOrder(orderId: string): Promise<OrderDto> {
  const row = await db('orders').where({ id: orderId }).first();
  return composeOrder(row as OrderRow);
}

async function loadOrderOrder(orderId: string): Promise<OrderDto> {
  const order = await loadOrder(orderId);
  if (!order) throw notFound('Order not found');
  return order;
}

async function composeOrder(row: OrderRow): Promise<OrderDto> {
  const items = await db('order_items').where({ order_id: row.id }).select('*') as OrderItemRow[];
  const events = await db('order_events').where({ order_id: row.id }).orderBy('created_at') as OrderEventRow[];
  return {
    id: row.id,
    orderNumber: row.order_number,
    userId: row.user_id,
    state: row.state,
    items: items.map((i) => ({
      id: i.id,
      variantId: i.variant_id,
      sku: i.sku,
      title: i.title,
      quantity: i.quantity,
      unitPrice: cents(i.unit_price_cents),
      lineTotal: cents(i.line_total_cents),
      fulfilmentMode: i.fulfilment_mode as any,
    })),
    subtotal: cents(row.subtotal_cents),
    shipping: cents(row.shipping_cents),
    tax: cents(row.tax_cents),
    total: cents(row.total_cents),
    currency: row.currency,
    shippingAddress: JSON.parse((row.shipping_address as string) || '{}'),
    isAssisted: Boolean(row.is_assisted),
    paymentMethod: row.payment_method ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    events: events.map((e) => toOrderEvent(e)),
  };
}

interface OrderEventRow {
  id: string;
  order_id: string;
  from_state: string | null;
  to_state: string;
  note?: string;
  created_at: string;
}

function toOrderEvent(e: OrderEventRow): OrderEventDto {
  return {
    id: e.id,
    orderId: e.order_id,
    fromState: (e.from_state as OrderState | null) ?? null,
    toState: e.to_state as OrderState,
    note: e.note,
    createdAt: e.created_at,
  };
}

async function insertEvent(
  orderId: string,
  from: OrderState | null,
  to: OrderState,
  note?: string,
): Promise<void> {
  await db('order_events').insert({
    id: uuid(),
    order_id: orderId,
    from_state: from,
    to_state: to,
    note: note ?? null,
  });
}

// late-bound payment service import to break circular imports cleanly

