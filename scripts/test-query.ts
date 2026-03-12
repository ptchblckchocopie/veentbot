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

  const testQueries = [
    'What do you guys do?',                    // Should match "What does your company do?" → Tier 1
    'When are you open?',                       // Should match "What are your business hours?" → Tier 1
    'Can I get my money back?',                 // Should match refund policy → Tier 1 or 2
    'Do you accept GCash?',                     // Should match payment methods → Tier 1 or 2
    'What is the meaning of life?',             // Off-topic → Tier 3
  ];

  console.log('=== VEENT BOT — Query Pipeline Test ===\n');

  for (const q of testQueries) {
    console.log(`Q: "${q}"`);
    const response = await bot.query(q);
    console.log(`  Tier: ${response.tier} | Confidence: ${response.confidence.toFixed(3)} | Cached: ${response.cached}`);
    console.log(`  A: ${response.answer.substring(0, 150)}${response.answer.length > 150 ? '...' : ''}`);
    if (response.suggestedQuestions.length > 0) {
      console.log(`  Suggestions: ${response.suggestedQuestions.join(', ')}`);
    }
    console.log();
  }

  // Health check
  const health = await bot.healthCheck();
  console.log('Health:', health);

  await closeDatabase();
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
