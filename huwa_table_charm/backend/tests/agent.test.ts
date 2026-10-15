import { describe, it, expect, beforeEach } from 'vitest';
import db from '../src/config/database';
import * as catalogService from '../src/services/catalog.service';
import * as agent from '../src/services/agent.service';

describe('Charm Agent guided selling', () => {
  beforeEach(async () => {
    await db('categories').del();
    await db('products').del();
    await db('variants').del();
    await db('agent_messages').del();
    await db('agent_sessions').del();
    await db('agent_tool_calls').del();
    const catId = (await catalogService.createCategory('cookware', 'Cookware')).id;
    const product = await catalogService.createProduct({
      type: 'cookware', title: 'Cast Iron Dutch Oven', slug: 'cast-iron-dutch-oven',
      description: 'Enameled cast iron', category: catId, material: 'cast_iron',
      features: { induction_compatible: true, microwave_safe: false, dishwasher_safe: false, pfas_free: true, oven_safe: true, oven_temp_c: 260 },
      images: [], tags: [], published: true,
    });
    await catalogService.createVariant({
      productId: product.id, sku: 'DO-1', title: '26 cm', options: { size: '26 cm' }, price: 129.99,
      stock: 5, leadTimeDays: 0, weightKg: 4, widthCm: 30, heightCm: 20, depthCm: 30, fulfilmentMode: 'stocked', isEngravable: false,
    });
  });

  it('behaves like an assistant when greeting', async () => {
    const res = await agent.chat({ sessionKey: 'sess-greet', message: 'hi', anonymousId: 'anon-greet' });
    expect(res.reply.toLowerCase()).toContain('charm');
    expect(res.toolCalls.length).toBe(0);
  });

  it('searches products by natural language', async () => {
    const res = await agent.chat({ sessionKey: 'sess-search', message: 'looking for a cast iron dutch oven', anonymousId: 'anon-search' });
    expect(res.toolCalls.length).toBeGreaterThan(0);
    expect(res.reply).toContain('Cast Iron Dutch Oven');
    const searchCall = res.toolCalls.find((t) => t.tool === 'product_search');
    expect(searchCall?.success).toBe(true);
    const hits = searchCall?.result as Array<{ productTitle: string }>;
    expect(hits[0].productTitle).toContain('Cast Iron Dutch Oven');
  });

  it('checks compatibility', async () => {
    const res = await agent.chat({ sessionKey: 'sess-compat', message: 'is the cast iron dutch oven dishwasher safe?', anonymousId: 'anon-compat' });
    expect(res.reply).toContain('compatibility');
    expect(res.reply).toContain('Dishwasher: No');
  });

  it('recommends bundles', async () => {
    const res = await agent.chat({ sessionKey: 'sess-bundle', message: 'do you have any bundles for a gift?', anonymousId: 'anon-bundle' });
    expect(res.toolCalls.some((t) => t.tool === 'bundle_recommend')).toBe(true);
  });

  it('persists messages and masks PII', async () => {
    await agent.chat({ sessionKey: 'sess-pii', message: 'my email is a@b.com and phone 123-456-7890', anonymousId: 'anon-pii' });
    const [session] = await db('agent_sessions').where({ session_key: 'sess-pii' });
    const masked = await db('agent_messages').where({ session_id: session.id, role: 'user' }).first();
    expect(masked.masked_content).not.toContain('a@b.com');
  });
});
