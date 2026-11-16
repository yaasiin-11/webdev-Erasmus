import { createContainer } from '../container.js';
import { DEMO_PASSWORD, DEMO_USERS, seedDemo } from '../seed.js';

if (!process.env.DATABASE_URL) {
  console.error('missing DATABASE_URL: see .env.example');
  process.exit(1);
}
const { pool, repos, services } = await createContainer({ databaseUrl: process.env.DATABASE_URL, log: console.log });
const created = await seedDemo({ services, repos });
console.log(created ? 'demo data created' : 'demo data was already there');
console.log(`accounts: ${DEMO_USERS.map((u) => u.email).join(', ')} · password: ${DEMO_PASSWORD}`);
await pool.end();
