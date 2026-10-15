import knex, { type Knex } from 'knex';
import knexfile from '../../knexfile';

// Select the environment config (test/dev use SQLite, prod uses Postgres)
const env = (process.env.NODE_ENV as 'development' | 'test' | 'production') || 'development';
const dbConfig = knexfile[env] ?? knexfile.development;

export const db: Knex = knex(dbConfig);

export default db;
