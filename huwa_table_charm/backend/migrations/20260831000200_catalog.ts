import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('categories', (table) => {
    table.uuid('id').primary();
    table.string('slug').notNullable().unique();
    table.string('title').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('products', (table) => {
    table.uuid('id').primary();
    table.string('type').notNullable(); // cookware | tableware | ...
    table.string('title').notNullable();
    table.string('slug').notNullable().unique();
    table.text('description').notNullable();
    table.uuid('category_id').nullable().references('id').inTable('categories').onDelete('SET NULL');
    table.string('material').notNullable();
    // features stored as JSON: { induction_compatible, microwave_safe, ... }
    table.json('features').notNullable();
    table.json('images');
    table.json('tags');
    table.boolean('published').notNullable().defaultTo(true);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('variants', (table) => {
    table.uuid('id').primary();
    table.uuid('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
    table.string('sku').notNullable().unique();
    table.string('title').notNullable();
    table.json('options');
    table.integer('price_cents').notNullable();
    table.integer('compare_at_price_cents').nullable();
    // stock is null for make_to_order
    table.integer('stock').nullable();
    table.integer('lead_time_days').notNullable().defaultTo(0);
    table.decimal('weight_kg', 8, 3).notNullable().defaultTo(1);
    table.decimal('width_cm', 8, 2).notNullable().defaultTo(20);
    table.decimal('height_cm', 8, 2).notNullable().defaultTo(20);
    table.decimal('depth_cm', 8, 2).notNullable().defaultTo(20);
    table.string('fulfilment_mode').notNullable().defaultTo('stocked');
    table.boolean('is_engravable').notNullable().defaultTo(false);
    table.string('image').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('bundles', (table) => {
    table.uuid('id').primary();
    table.string('slug').notNullable().unique();
    table.string('title').notNullable();
    table.text('description').notNullable();
    table.integer('discount_pct').notNullable().defaultTo(0);
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('bundle_items', (table) => {
    table.uuid('id').primary();
    table.uuid('bundle_id').notNullable().references('id').inTable('bundles').onDelete('CASCADE');
    table.uuid('variant_id').notNullable().references('id').inTable('variants').onDelete('CASCADE');
    table.integer('quantity').notNullable().defaultTo(1);
  });

  await knex.schema.createTable('reviews', (table) => {
    table.uuid('id').primary();
    table.uuid('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
    table.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.integer('rating').notNullable();
    table.text('body').nullable();
    table.boolean('published').notNullable().defaultTo(false);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('reviews');
  await knex.schema.dropTableIfExists('bundle_items');
  await knex.schema.dropTableIfExists('bundles');
  await knex.schema.dropTableIfExists('variants');
  await knex.schema.dropTableIfExists('products');
  await knex.schema.dropTableIfExists('categories');
}
