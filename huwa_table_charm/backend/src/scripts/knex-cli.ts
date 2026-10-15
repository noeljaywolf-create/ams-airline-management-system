/**
 * tsx-based migration/seed runner. Avoids the knex CLI's inconsistent TypeScript
 * loader by driving the knex instance directly. Usage:
 *   tsx src/scripts/knex-cli.ts migrate
 *   tsx src/scripts/knex-cli.ts rollback [--all]
 *   tsx src/scripts/knex-cli.ts seed
 */
import knex, { type Knex } from 'knex';
import knexfile from '../../knexfile';

const env = (process.env.NODE_ENV as 'development' | 'test' | 'production') || 'development';
const cfg = knexfile[env] ?? knexfile.development;

const command = process.argv[2] ?? 'migrate';

async function main(): Promise<void> {
  const connection: Knex = knex(cfg);
  try {
    if (command === 'migrate') {
      const [batch, log] = await connection.migrate.latest();
      console.log(`Migration batch ${batch} applied${log.length ? `: ${log.join(', ')}` : ' (up to date)'}`);
    } else if (command === 'rollback') {
      const all = process.argv.includes('--all');
      const dropped = all ? await connection.migrate.rollback(undefined, true) : await connection.migrate.rollback();
      console.log(`Rolled back: ${Array.isArray(dropped) ? dropped.join(', ') : dropped}`);
    } else if (command === 'seed') {
      await connection.seed.run();
      console.log('Seed data applied.');
    } else {
      console.error(`Unknown command: ${command}`);
      process.exitCode = 1;
    }
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await connection.destroy();
  }
}

main();
