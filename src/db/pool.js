import pg from 'pg';

export const MEMORY_URL = 'memory';

export async function createPool(databaseUrl) {
  if (databaseUrl === MEMORY_URL) {
    const { newDb } = await import('pg-mem');
    const memory = newDb();
    const { Pool } = memory.adapters.createPg();
    return new Pool();
  }
  const ssl = /sslmode=require|neon\.tech/.test(databaseUrl) ? { rejectUnauthorized: true } : undefined;
  return new pg.Pool({
    connectionString: databaseUrl,
    ssl,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
}

export async function withTransaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
