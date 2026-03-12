import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import { createFAQBot } from '../src/core/index.js';
import { closeDatabase } from '../src/core/database/index.js';
import 'dotenv/config';

async function main() {
  const dataPath = join(import.meta.dirname, '..', 'data', 'faqs.yaml');
  const raw = readFileSync(dataPath, 'utf-8');
  const data = parse(raw) as { faqs: Array<{ question: string; answer: string; category?: string; metadata?: Record<string, unknown> }> };

  if (!data.faqs || data.faqs.length === 0) {
    console.log('No FAQs found in data/faqs.yaml');
    process.exit(1);
  }

  console.log(`Found ${data.faqs.length} FAQ entries. Seeding...`);

  const bot = await createFAQBot({
    database: { connectionString: process.env.DATABASE_URL! },
    companyName: process.env.COMPANY_NAME || 'Veent',
    embedding: {
      provider: (process.env.EMBEDDING_PROVIDER as 'gemini' | 'ollama') || 'ollama',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      apiKey: process.env.GEMINI_API_KEY,
    },
    llm: {
      provider: 'gemini',
      apiKey: process.env.GEMINI_API_KEY || '',
    },
  });

  const ids = await bot.seedFAQs(data.faqs);

  console.log(`\nSeeded ${ids.length} FAQ entries:`);
  data.faqs.forEach((faq, i) => {
    console.log(`  [${i + 1}] ${faq.question} → ${ids[i]}`);
  });

  await closeDatabase();
  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
