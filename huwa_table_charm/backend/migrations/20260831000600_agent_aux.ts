import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('agent_sessions', (table) => {
    table.uuid('id').primary();
    table.string('session_key').notNullable().unique();
    table.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.string('anonymous_id').nullable();
    table.string('status').notNullable().defaultTo('active');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('agent_messages', (table) => {
    table.uuid('id').primary();
    table.uuid('session_id').notNullable().references('id').inTable('agent_sessions').onDelete('CASCADE');
    table.string('role').notNullable(); // user | assistant | tool
    table.text('content').notNullable();
    table.text('masked_content').nullable(); // PII-masked copy for analytics
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('agent_tool_calls', (table) => {
    table.uuid('id').primary();
    table.uuid('session_id').notNullable().references('id').inTable('agent_sessions').onDelete('CASCADE');
    table.string('tool').notNullable();
    table.json('args');
    table.json('result');
    table.boolean('success').notNullable().defaultTo(true);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  // Assisted-revenue attribution: which agent session influenced which order
  await knex.schema.createTable('assisted_orders', (table) => {
    table.uuid('id').primary();
    table.uuid('session_id').notNullable().references('id').inTable('agent_sessions').onDelete('CASCADE');
    table.uuid('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    table.timestamp('assigned_at').notNullable().defaultTo(knex.fn.now());
  });

  // Transactional outbox for guaranteed side-effect delivery
  await knex.schema.createTable('outbox', (table) => {
    table.uuid('id').primary();
    table.string('type').notNullable();
    table.json('payload').notNullable();
    table.string('status').notNullable().defaultTo('pending'); // pending | published | failed
    table.integer('attempts').notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary();
    table.uuid('user_id').nullable();
    table.string('action').notNullable();
    table.string('resource').notNullable();
    table.string('resource_id').nullable();
    table.json('detail').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('outbox');
  await knex.schema.dropTableIfExists('assisted_orders');
  await knex.schema.dropTableIfExists('agent_tool_calls');
  await knex.schema.dropTableIfExists('agent_messages');
  await knex.schema.dropTableIfExists('agent_sessions');
}
