import { createFAQBot } from '../src/core/index.js';
import { closeDatabase } from '../src/core/database/index.js';
import 'dotenv/config';

const testQueries = [
  // Conversational — these used to get "I don't know"
  { q: "Hello", label: "GREETING: Hello" },
  { q: "Kumusta", label: "GREETING: Kumusta (Tagalog)" },
  { q: "Thanks!", label: "THANKS" },
  { q: "Bye", label: "GOODBYE" },
  { q: "Help", label: "HELP REQUEST" },
  { q: "What can you do?", label: "CAPABILITIES" },
  { q: "This is useless", label: "COMPLAINT" },

  // Edge cases that should still go to retrieval
  { q: "How do I buy tickets?", label: "NORMAL: buy tickets" },

  // Off-topic — should get smart decline (not generic "I don't know")
  { q: "How do I cook pasta?", label: "OFF-TOPIC: cooking" },
  { q: "What is the meaning of life?", label: "OFF-TOPIC: philosophy" },
];

async function main() {
  const bot = await createFAQBot({
    database: { connectionString: process.env.DATABASE_URL! },
    companyName: process.env.COMPANY_NAME || 'Veent',
    embedding: { provider: 'ollama', baseUrl: process.env.OLLAMA_BASE_URL },
    llm: { provider: 'gemini', apiKey: process.env.GEMINI_API_KEY },
  });

  console.log('=== Smart Bot Test ===\n');

  for (const { q, label } of testQueries) {
    const start = Date.now();
    const res = await bot.query(q);
    const ms = Date.now() - start;

    const hasGoodResponse = res.answer.length > 20 && !res.answer.includes("I'm sorry, I don't have information");
    const status = hasGoodResponse ? 'GOOD' : 'WEAK';

    console.log(`[${status}] ${label}`);
    console.log(`  Q: "${q}"`);
    console.log(`  Tier: ${res.tier} | Confidence: ${res.confidence.toFixed(3)} | ${ms}ms`);
    console.log(`  A: ${res.answer.substring(0, 160)}`);
    if (res.suggestedQuestions.length > 0) {
      console.log(`  Suggestions: ${res.suggestedQuestions.slice(0, 3).join(' | ')}`);
    }
    console.log('');
  }

  await closeDatabase();
  console.log('Done!');
}

main().catch(e => { console.error(e); process.exit(1); });
