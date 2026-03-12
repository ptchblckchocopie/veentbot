import { createFAQBot } from '../src/core/index.js';
import { closeDatabase } from '../src/core/database/index.js';
import 'dotenv/config';

async function main() {
  const bot = await createFAQBot({
    database: { connectionString: process.env.DATABASE_URL! },
    companyName: 'Veent',
    embedding: { provider: 'ollama', baseUrl: process.env.OLLAMA_BASE_URL },
    llm: { provider: 'gemini', apiKey: process.env.GEMINI_API_KEY },
  });

  const q = 'Can I pay with GCash and get a refund later?';

  console.log('Query 1 (fresh):');
  const r1 = await bot.query(q);
  console.log(`  Cached: ${r1.cached} | Tier: ${r1.tier}`);
  console.log(`  A: ${r1.answer}\n`);

  console.log('Query 2 (should hit cache):');
  const r2 = await bot.query(q);
  console.log(`  Cached: ${r2.cached} | Tier: ${r2.tier}`);
  console.log(`  A: ${r2.answer}`);

  await closeDatabase();
}

main().catch(err => { console.error(err); process.exit(1); });
