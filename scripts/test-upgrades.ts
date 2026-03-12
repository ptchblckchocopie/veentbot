import { createFAQBot } from '../src/core/index.js';
import { closeDatabase } from '../src/core/database/index.js';
import 'dotenv/config';

const testQueries = [
  // Typo correction tests
  { q: "how to byu a tiket on veent tiks?", label: "TYPO: buy ticket + brand" },
  { q: "can I pay with gcash?", label: "TYPO: GCash casing" },
  { q: "how to sing in to my acount?", label: "TYPO: sign in + account" },
  { q: "where is the contac page?", label: "TYPO: contact" },

  // Tagalog tests
  { q: "Paano bumili ng ticket?", label: "TAGALOG: buy ticket" },
  { q: "Saan makikita ang mga events?", label: "TAGALOG: find events" },
  { q: "Pwede ba GCash?", label: "TAGALOG: GCash" },
  { q: "Paano mag-log in?", label: "TAGALOG: log in" },
  { q: "May refund ba?", label: "TAGALOG: refund" },
  { q: "Ano ang dapat dalhin ko sa event?", label: "TAGALOG: what to bring" },
];

async function main() {
  const bot = await createFAQBot({
    database: { connectionString: process.env.DATABASE_URL! },
    companyName: process.env.COMPANY_NAME || 'Veent',
    embedding: { provider: 'ollama', baseUrl: process.env.OLLAMA_BASE_URL },
    llm: { provider: 'gemini', apiKey: process.env.GEMINI_API_KEY },
  });

  console.log('=== Upgrade Verification Tests ===\n');

  let passed = 0;
  for (const { q, label } of testQueries) {
    const start = Date.now();
    const res = await bot.query(q);
    const ms = Date.now() - start;
    const ok = res.tier !== 'decline';

    console.log(`${ok ? 'PASS' : 'FAIL'} [${label}]`);
    console.log(`  Q: ${q}`);
    console.log(`  Tier: ${res.tier} | Confidence: ${res.confidence.toFixed(3)} | ${ms}ms`);
    console.log(`  A: ${res.answer.substring(0, 120)}...`);
    console.log('');

    if (ok) passed++;
  }

  console.log(`\n=== Results: ${passed}/${testQueries.length} passed ===`);

  await closeDatabase();
}

main().catch(e => { console.error(e); process.exit(1); });
