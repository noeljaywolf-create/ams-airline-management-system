/**
 * AMS — database configuration.
 *
 * Development and test use SQLite so the whole suite runs with no services
 * and no container. Production uses PostgreSQL, because AMS depends on
 * three PostgreSQL features SQLite does not have and will not fake:
 *
 *   1. SELECT ... FOR UPDATE  — the row lock that makes double-spend
 *      unrepresentable. This is not a performance nicety; it is the
 *      control.
 *   2. GENERATED ALWAYS AS ... STORED — availability computed by the
 *      database so it can never drift from its components.
 *   3. ROW LEVEL SECURITY — tenant isolation enforced below the
 *      application.
 *
 * Swapping the driver is the one place the local/production divergence
 * matters, so it is stated plainly rather than hidden.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const env = process.env.NODE_ENV ?? 'development';

/** @type {Record<string, any>} */
const config = {
  development: {
    client: 'better-sqlite3',
    connection: { filename: path.join(dirname, '..', 'ams.sqlite') },
    pool: { min: 1, max: 1 },
    useNullAsDefault: true,
    migrations: { directory: path.join(dirname, 'migrations'), extension: 'js', loadExtensions: ['.js'] },
  },

  test: {
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    pool: { min: 1, max: 1 },
    useNullAsDefault: true,
    migrations: { directory: path.join(dirname, 'migrations'), extension: 'js', loadExtensions: ['.js'] },
  },

  production: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST ?? '127.0.0.1',
      port: Number(process.env.DB_PORT ?? 5432),
      database: process.env.DB_NAME ?? 'ams',
      user: process.env.DB_USER ?? 'ams',
      password: process.env.DB_PASSWORD ?? '',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    },
    // FOR UPDATE and RLS sessions each hold a connection for the
    // transaction's duration, so the pool must be sized for genuine
    // concurrency, not request rate.
    pool: { min: 4, max: 20 },
    migrations: { directory: path.join(dirname, 'migrations'), extension: 'js', loadExtensions: ['.js'] },
  },
};

export default { [env]: config[env] };
