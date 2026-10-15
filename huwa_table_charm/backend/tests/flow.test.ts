import { describe, it, expect, beforeEach } from 'vitest';
import db from '../src/config/database';
import * as authService from '../src/services/auth.service';
import * as catalogService from '../src/services/catalog.service';
import * as cartService from '../src/services/cart.service';
import * as orderService from '../src/services/order.service';

function makeProductPayload(i: number) {
  return {
    type: 'cookware' as const,
    title: `Test Pan ${i}`,
    slug: `test-pan-${i}`,
    description: 'A test cookware product',
    category: 'cookware',
    material: 'aluminium',
    features: { induction_compatible: true, microwave_safe: false, dishwasher_safe: true, pfas_free: true, oven_safe: true, oven_temp_c: 220 },
    images: [],
    tags: [],
    published: true,
  };
}

describe('catalog + cart + order flow', () => {
  let catId: string;
  let variantId: string;

  beforeEach(async () => {
    await db('agent_tool_calls').del();
    await db('agent_messages').del();
    await db('agent_sessions').del();
    await db('production_jobs').del();
    await db('stock_movements').del();
    await db('inventory_stock').del();
    await db('refunds').del();
    await db('payments').del();
    await db('order_events').del();
    await db('order_items').del();
    await db('orders').del();
    await db('cart_items').del();
    await db('carts').del();
    await db('bundle_items').del();
    await db('bundles').del();
    await db('reviews').del();
    await db('variants').del();
    await db('products').del();
    await db('categories').del();
    catId = (await catalogService.createCategory('cookware', 'Cookware')).id;
  });

  it('creates a product and stocks a variant', async () => {
    const product = await catalogService.createProduct({ ...makeProductPayload(1), category: catId });
    const variant = await catalogService.createVariant({
      productId: product.id,
      sku: 'TEST-SKU-1',
      title: '24 cm',
      options: { size: '24 cm' },
      price: 39.99,
      stock: 10,
      leadTimeDays: 0,
      weightKg: 1,
      widthCm: 25,
      heightCm: 6,
      depthCm: 25,
      fulfilmentMode: 'stocked',
      isEngravable: false,
    });
    variantId = variant.id;
    expect(variant.price).toBeCloseTo(39.99);
    expect(variant.fulfilmentMode).toBe('stocked');

    const stock = await db('inventory_stock').where({ variant_id: variantId }).first();
    expect(Number(stock.sellable)).toBe(10);
  });

  it('runs a full assisted checkout flow', async () => {
    const product = await catalogService.createProduct({ ...makeProductPayload(2), category: catId });
    const variant = await catalogService.createVariant({
      productId: product.id,
      sku: 'TEST-SKU-2',
      title: '24 cm',
      options: { size: '24 cm' },
      price: 20,
      stock: 5,
      leadTimeDays: 0,
      weightKg: 1,
      widthCm: 25,
      heightCm: 6,
      depthCm: 25,
      fulfilmentMode: 'stocked',
      isEngravable: false,
    });
    variantId = variant.id;

    // add to cart
    const cart = await cartService.addItem(null, 'anon-1', variantId, 2);
    expect(cart.itemCount).toBe(2);

    // create order from cart (OPEN)
    const { order } = await orderService.createOrderFromCart(null, 'anon-1', { name: 'A', line1: '1 St', city: 'X', state: 'Y', postalCode: '12345', country: 'US' }, true);
    expect(order.state).toBe('OPEN');
    expect(order.isAssisted).toBe(true);
    expect(order.total).toBeGreaterThan(0);

    // pay + finalize -> PAID, reserves stock
    const paid = await orderService.finalizePaidOrder(order.id);
    expect(paid.state).toBe('PAID');
    const stock = await db('inventory_stock').where({ variant_id: variantId }).first();
    expect(Number(stock.reserved)).toBe(2);
    expect(Number(stock.sellable)).toBe(3);

    // admin transitions through fulfilment
    const ready = await orderService.transitionOrder(order.id, 'READY');
    expect(ready.state).toBe('READY');
    const shipped = await orderService.transitionOrder(order.id, 'SHIPPED');
    expect(shipped.state).toBe('SHIPPED');
    const delivered = await orderService.transitionOrder(order.id, 'DELIVERED');
    expect(delivered.state).toBe('DELIVERED');

    // illegal transition rejected
    await expect(orderService.transitionOrder(order.id, 'PAID')).rejects.toThrow(/Cannot transition/);
  });

  it('registers + logs in a user', async () => {
    const { user, tokens } = await authService.register({ email: 'u@example.com', password: 'password123', name: 'U' });
    expect(user.roles).toContain('customer');
    expect(tokens.accessToken).toBeTruthy();

    const login = await authService.login({ email: 'u@example.com', password: 'password123' });
    expect(login.user.id).toBe(user.id);
  });
});
