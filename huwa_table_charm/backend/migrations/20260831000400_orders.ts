import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('orders', (table) => {
    table.uuid('id').primary();
    table.string('order_number').notNullable().unique();
    table.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.string('state').notNullable().defaultTo('OPEN');
    table.integer('subtotal_cents').notNullable().defaultTo(0);
    table.integer('shipping_cents').notNullable().defaultTo(0);
    table.integer('tax_cents').notNullable().defaultTo(0);
    table.integer('total_cents').notNullable().defaultTo(0);
    table.string('currency').notNullable().defaultTo('USD');
    table.json('shipping_address');
    table.json('shipping_option');
    table.boolean('is_assisted').notNullable().defaultTo(false);
    table.string('payment_intent_id').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('order_items', (table) => {
    table.uuid('id').primary();
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.uuid('variant_id').notNullable().references('id').inTable('variants').onDelete('RESTRICT');
    table.string('sku').notNullable();
    table.string('title').notNullable();
    table.integer('quantity').notNullable();
    table.integer('unit_price_cents').notNullable();
    table.integer('line_total_cents').notNullable();
    table.string('fulfilment_mode').notNullable().defaultTo('stocked');
  });

  await knex.schema.createTable('order_events', (table) => {
    table.uuid('id').primary();
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.string('from_state').nullable();
    table.string('to_state').notNullable();
    table.text('note').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('payments', (table) => {
    table.uuid('id').primary();
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.string('intent_id').notNullable().unique();
    table.string('status').notNullable();
    table.integer('amount_cents').notNullable();
    table.string('currency').notNullable().defaultTo('USD');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('refunds', (table) => {
    table.uuid('id').primary();
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.uuid('payment_id').nullable().references('id').inTable('payments').onDelete('SET NULL');
    table.string('refund_id').notNullable().unique();
    table.integer('amount_cents').notNullable();
    table.string('currency').notNullable().defaultTo('USD');
    table.string('status').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('refunds');
  await knex.schema.dropTableIfExists('payments');
  await knex.schema.dropTableIfExists('order_events');
  await knex.schema.dropTableIfExists('order_items');
  await knex.schema.dropTableIfExists('orders');
}
