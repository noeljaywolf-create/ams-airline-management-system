import { describe, it, expect } from 'vitest';
import { v4 as uuid } from 'uuid';
import db from '../src/config/database';
import { seed } from '../seeds/002_petal_pearl';
import { addBatch, getCart } from '../src/services/cart.service';
describe('Petal & Pearl integration', () => {
  it('adds 4 products and 16 variants without replacing existing catalog data', async () => {
    const id = uuid(); await db('categories').insert({ id, slug: 'existing-category', title: 'Existing category' });
    await seed(db); await seed(db);
    expect(await db('categories').where({ id }).first()).toBeTruthy();
    expect(await db('products').whereIn('slug', ['bloom-carafe','ribbon-cup','petal-bowl','pearl-plate'])).toHaveLength(4);
    expect(await db('variants').where('sku', 'like', 'PP-%')).toHaveLength(16);
  });
  it('adds a table for four to the same cart with catalog prices', async () => {
    await seed(db); const variants = await db('variants').where('sku', 'like', '%-KILN');
    const cart = await addBatch(null, 'pp-table-four', variants.map(v => ({ variantId: v.id, quantity: v.sku.includes('PITCHER') ? 1 : 4 })));
    expect(cart.items).toHaveLength(4); expect(cart.itemCount).toBe(13); expect(cart.subtotal).toBe(368);
  });
  it('rolls back every added item if one requested variant is missing', async () => {
    await seed(db); const variant = await db('variants').where({ sku: 'PP-CUP-KILN' }).first();
    await expect(addBatch(null, 'pp-invalid', [{ variantId: variant.id, quantity: 2 }, { variantId: uuid(), quantity: 1 }])).rejects.toThrow();
    expect((await getCart(null, 'pp-invalid')).items).toHaveLength(0);
  });
  it('checks the existing cart quantity when a stocked variant is added again', async () => {
    await seed(db); const variant = await db('variants').where({ sku: 'PP-PLATE-CHALK' }).first();
    await db('variants').where({ id: variant.id }).update({ fulfilment_mode: 'stocked', stock: 3 });
    await addBatch(null, 'pp-stock', [{ variantId: variant.id, quantity: 2 }]);
    await expect(addBatch(null, 'pp-stock', [{ variantId: variant.id, quantity: 2 }])).rejects.toThrow('Insufficient stock');
    expect((await getCart(null, 'pp-stock')).itemCount).toBe(2);
  });
});
