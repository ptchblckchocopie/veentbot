import { initDatabase, closeDatabase } from '../src/core/database/index.js';
import 'dotenv/config';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  console.log('Running database migrations...');
  await initDatabase(connectionString);
  console.log('Database schema applied successfully.');

  await closeDatabase();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
