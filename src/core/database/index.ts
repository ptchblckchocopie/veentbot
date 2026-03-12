import pg from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(connectionString: string): pg.Pool {
  if (!pool) {
    const needsSsl = connectionString.includes('ondigitalocean.com') ||
      connectionString.includes('sslmode=require') ||
      process.env.DATABASE_SSL === 'true';

    // Strip sslmode from URL to prevent pg-connection-string from overriding our ssl config
    const cleanUrl = needsSsl
      ? connectionString.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '')
      : connectionString;

    // Use fewer connections in serverless to avoid exhausting DO managed DB slots
    const maxConnections = process.env.VERCEL ? 3 : 10;
    pool = new Pool({
      connectionString: cleanUrl,
      max: maxConnections,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export async function initDatabase(connectionString: string): Promise<void> {
  const db = getPool(connectionString);

  // In serverless environments, skip schema migration (run it manually via `npm run migrate`)
  if (process.env.VERCEL || process.env.SKIP_MIGRATION === 'true') {
    // Just verify the connection works
    await db.query('SELECT 1');
    return;
  }

  const schemaPath = join(import.meta.dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');

  await db.query(schema);
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
