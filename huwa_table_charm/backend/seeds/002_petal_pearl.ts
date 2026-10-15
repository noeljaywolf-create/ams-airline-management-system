import type { Knex } from 'knex';
import { v4 as uuid } from 'uuid';
// Additive: safe to run against an existing catalog without deleting any rows.
export async function seed(db: Knex): Promise<void> {
  await db.transaction(async trx => {
    let category = await trx('categories').where({ slug: 'petal-pearl' }).first();
    if (!category) { category = { id: uuid(), slug: 'petal-pearl', title: 'Petal & Pearl' }; await trx('categories').insert(category); }
    const pieces = [{ slug: 'bloom-carafe', title: 'Bloom Carafe', object: 'pitcher', price: 4800 }, { slug: 'ribbon-cup', title: 'Ribbon Cup', object: 'cup', price: 2400 }, { slug: 'petal-bowl', title: 'Petal Bowl', object: 'bowl', price: 2800 }, { slug: 'pearl-plate', title: 'Pearl Plate', object: 'plate', price: 2800 }];
    for (const piece of pieces) {
      let product = await trx('products').where({ slug: piece.slug }).first();
      if (!product) { product = { id: uuid(), slug: piece.slug, title: piece.title, type: 'tableware', category_id: category.id, description: 'Petal & Pearl original design concept. Scalloped porcelain with champagne details. Review sample only; prices, manufacturing, care and food-safety specifications require validation.', material: 'porcelain', features: JSON.stringify({ concept: true }), tags: JSON.stringify(['petal-pearl', 'design-preview']), images: JSON.stringify(['/petal-pearl/' + piece.object + '.png']), published: true }; await trx('products').insert(product); }
      for (const [finish, name] of [['kiln', 'Rose'], ['chalk', 'Pearl'], ['basalt', 'Mulberry'], ['sage', 'Pistachio']]) {
        const sku = 'PP-' + piece.object.toUpperCase() + '-' + finish.toUpperCase();
        if (await trx('variants').where({ sku }).first()) continue;
        await trx('variants').insert({ id: uuid(), product_id: product.id, sku, title: name + ' / Design preview', options: JSON.stringify({ finish, glaze: name }), price_cents: piece.price, stock: null, fulfilment_mode: 'make_to_order', lead_time_days: 0, is_engravable: false, image: '/petal-pearl/' + piece.object + '.png' });
      }
    }
  });
}
