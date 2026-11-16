import { createPool } from '../db/pool.js';
import { migrate } from '../db/migrate.js';

if (!process.env.DATABASE_URL) {
  console.error('missing DATABASE_URL: see .env.example');
  process.exit(1);
}
const pool = await createPool(process.env.DATABASE_URL);
const ran = await migrate(pool, { log: console.log });
console.log(ran.length ? `${ran.length} migration(s) applied` : 'database is up to date');
await pool.end();
