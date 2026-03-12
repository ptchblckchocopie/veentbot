import { createFAQBot } from '../src/core/index.js';
import { closeDatabase } from '../src/core/database/index.js';
import 'dotenv/config';

const testQueries = [
  "I want to buy a ticket, how do I do that?",
  "Where do I click to see events?",
  "How do I log in?",
  "I want to see my purchased tickets",
  "How do I select my seat?",
  "Where can I find the contact page?",
  "I want to create an event, where do I start?",
  "How do I go back to the home page?",
  "Where is the login button on the website?",
  "How do I pay using GCash?",
];

async function main() {
  const bot = await createFAQBot({
    database: { connectionString: process.env.DATABASE_URL! },
    companyName: process.env.COMPANY_NAME || 'Veent',
    embedding: { provider: 'ollama', baseUrl: process.env.OLLAMA_BASE_URL },
    llm: { provider: 'gemini', apiKey: process.env.GEMINI_API_KEY },
  });

  console.log('=== Navigation FAQ Test ===\n');

  for (const query of testQueries) {
    const start = Date.now();
    const res = await bot.query(query);
    const ms = Date.now() - start;

    console.log(`Q: ${query}`);
    console.log(`Tier: ${res.tier} | Confidence: ${res.confidence.toFixed(3)} | ${ms}ms`);
    console.log(`A: ${res.answer.substring(0, 150)}...`);
    console.log('---\n');
  }

  await closeDatabase();
  console.log('Done!');
}

main().catch(e => { console.error(e); process.exit(1); });
