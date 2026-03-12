import { createFAQBot } from '../src/core/index.js';
import { closeDatabase } from '../src/core/database/index.js';
import 'dotenv/config';

async function main() {
  const bot = await createFAQBot({
    database: { connectionString: process.env.DATABASE_URL! },
    companyName: process.env.COMPANY_NAME || 'Veent',
    embedding: {
      provider: 'ollama',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    },
    llm: {
      provider: 'gemini',
      apiKey: process.env.GEMINI_API_KEY || '',
    },
  });

  // These should hit Tier 2 — questions that relate to FAQs but need LLM synthesis
  const tier2Queries = [
    'I want to start a project with you, what do I need to know?',
    'Can I pay with GCash and get a refund later if I change my mind?',
    'Tell me everything about how you work',
    'I need a website built quickly, is that possible and how much?',
  ];

  console.log('=== TIER 2 (LLM Generation) Test ===\n');

  for (const q of tier2Queries) {
    console.log(`Q: "${q}"`);
    const res = await bot.query(q);
    console.log(`  Tier: ${res.tier} | Confidence: ${res.confidence.toFixed(3)} | Cached: ${res.cached}`);
    console.log(`  A: ${res.answer}`);
    console.log();
  }

  // Test caching — same query should hit cache
  console.log('=== CACHE TEST ===\n');
  const q = 'I want to start a project with you, what do I need to know?';
  console.log(`Q: "${q}" (second time — should be cached)`);
  const res = await bot.query(q);
  console.log(`  Tier: ${res.tier} | Cached: ${res.cached}`);
  console.log(`  A: ${res.answer}`);

  await closeDatabase();
}

main().catch(err => { console.error('Test failed:', err); process.exit(1); });
