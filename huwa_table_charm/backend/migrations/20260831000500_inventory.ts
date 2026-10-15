import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Per-variant current stock for stocked items (physical sellable cover)
  await knex.schema.createTable('inventory_stock', (table) => {
    table.uuid('id').primary();
    table.uuid('variant_id').notNullable().references('id').inTable('variants').onDelete('CASCADE').unique();
    table.integer('on_hand').notNullable().defaultTo(0);
    table.integer('reserved').notNullable().defaultTo(0);
    table.integer('sellable').notNullable().defaultTo(0);
    table.integer('reorder_point').notNullable().defaultTo(0);
    table.boolean('backorder_allowed').notNullable().defaultTo(false);
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  // Audit trail of every stock movement
  await knex.schema.createTable('stock_movements', (table) => {
    table.uuid('id').primary();
    table.uuid('variant_id').notNullable().references('id').inTable('variants').onDelete('CASCADE');
    table.uuid('order_id').nullable().references('id').inTable('orders').onDelete('SET NULL');
    table.string('type').notNullable(); // restock | reservation | release | sale | audit_adjustment
    table.integer('change').notNullable();
    table.text('note').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  // Production queue for make_to_order fulfilment
  await knex.schema.createTable('production_jobs', (table) => {
    table.uuid('id').primary();
    table.uuid('order_item_id').notNullable().references('id').inTable('order_items').onDelete('CASCADE');
    table.string('status').notNullable().defaultTo('queued'); // queued | in_production | done | cancelled
    table.integer('lead_time_days').notNullable().defaultTo(0);
    table.timestamp('started_at').nullable();
    table.timestamp('completed_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('production_jobs');
  await knex.schema.dropTableIfExists('stock_movements');
  await knex.schema.dropTableIfExists('inventory_stock');
}
