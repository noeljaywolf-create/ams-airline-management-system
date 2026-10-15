import type { Knex } from 'knex';
import config from './src/config/index';

const common: Knex.Config = {
  migrations: {
    directory: './migrations',
    extension: 'ts',
  },
  seeds: {
    directory: './seeds',
    extension: 'ts',
  },
  useNullAsDefault: true,
};

const knexfile: Record<string, Knex.Config> = {
  development: {
    ...common,
    client: 'better-sqlite3',
    connection: { filename: './huwa_table_charm.db' },
    pool: { min: 1, max: 1 },
  },
  test: {
    ...common,
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    pool: { min: 1, max: 1 },
  },
  production:
    config.dbDriver === 'sqlite'
      ? {
          ...common,
          client: 'better-sqlite3',
          connection: { filename: config.dbPath || './huwa_table_charm.db' },
          pool: { min: 1, max: 1 },
        }
      : {
          ...common,
          client: 'pg',
          connection: config.db.url || {
            host: config.db.host,
            port: config.db.port,
            database: config.db.name,
            user: config.db.user,
            password: config.db.password,
          },
          pool: { min: 2, max: 10 },
        },
};

export default knexfile;
