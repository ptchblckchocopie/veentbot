import pg from 'pg';
import 'dotenv/config';

async function main() {
  const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');
  const pool = new pg.Pool({
    connectionString: url,
    ssl: url.includes('ondigitalocean.com') ? { rejectUnauthorized: false } : undefined,
  });

  const pattern = process.argv[2] || '%';
  const r = await pool.query('DELETE FROM semantic_cache WHERE response_text LIKE $1', [pattern]);
  console.log(`Deleted ${r.rowCount} cached entries matching: ${pattern}`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
