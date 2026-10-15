import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary();
    table.string('email').notNullable().unique();
    // bcrypt hash
    table.string('password_hash').notNullable();
    table.string('name').notNullable();
    // comma-joined roles
    table.string('roles').notNullable().defaultTo('customer');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('refresh_tokens', (table) => {
    table.uuid('id').primary();
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('token').notNullable().unique();
    table.timestamp('expires_at').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('addresses', (table) => {
    table.uuid('id').primary();
    table.uuid('user_id').nullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('name').notNullable();
    table.string('line1').notNullable();
    table.string('line2').nullable();
    table.string('city').notNullable();
    table.string('state').notNullable();
    table.string('postal_code').notNullable();
    table.string('country').notNullable().defaultTo('US');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('addresses');
  await knex.schema.dropTableIfExists('refresh_tokens');
  await knex.schema.dropTableIfExists('users');
}
