import { beforeAll, afterAll } from 'vitest';
import db from '../src/config/database';

// The services share a single `db` singleton (config/database.ts) which selects
// NODE_ENV. In tests we run migrations on that shared instance so service calls
// see a populated schema.
process.env.NODE_ENV = 'test';

beforeAll(async () => {
  await db.migrate.latest();
});

afterAll(async () => {
  await db.destroy();
});
