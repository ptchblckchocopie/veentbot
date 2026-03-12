import * as readline from 'readline';
import { createFAQBot } from '../src/core/index.js';
import { closeDatabase } from '../src/core/database/index.js';
import 'dotenv/config';

async function main() {
  const bot = await createFAQBot({
    database: { connectionString: process.env.DATABASE_URL! },
    companyName: process.env.COMPANY_NAME || 'Veent',
    embedding: { provider: 'ollama', baseUrl: process.env.OLLAMA_BASE_URL },
    llm: { provider: 'gemini', apiKey: process.env.GEMINI_API_KEY },
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let sessionId: string | undefined;

  console.log('');
  console.log('  ╔═══════════════════════════════════════╗');
  console.log('  ║          VEENT BOT - Live Chat         ║');
  console.log('  ╠═══════════════════════════════════════╣');
  console.log('  ║  Type a question and press Enter.      ║');
  console.log('  ║  Type "quit" to exit.                  ║');
  console.log('  ║  Type "debug" to toggle debug info.    ║');
  console.log('  ╚═══════════════════════════════════════╝');
  console.log('');

  let debug = false;

  const ask = () => {
    rl.question('You: ', async (input) => {
      const trimmed = input.trim();

      if (!trimmed) { ask(); return; }
      if (trimmed.toLowerCase() === 'quit' || trimmed.toLowerCase() === 'exit') {
        console.log('\nGoodbye!\n');
        await closeDatabase();
        rl.close();
        process.exit(0);
      }
      if (trimmed.toLowerCase() === 'debug') {
        debug = !debug;
        console.log(`  [debug mode ${debug ? 'ON' : 'OFF'}]\n`);
        ask();
        return;
      }

      try {
        const start = Date.now();
        const res = await bot.query(trimmed, sessionId);
        const ms = Date.now() - start;
        sessionId = res.sessionId;

        console.log(`\nBot: ${res.answer}`);

        if (debug) {
          console.log(`  [tier: ${res.tier} | confidence: ${res.confidence.toFixed(3)} | cached: ${res.cached} | ${ms}ms]`);
        }

        if (res.suggestedQuestions.length > 0) {
          console.log(`\n  Try asking:`);
          res.suggestedQuestions.forEach(q => console.log(`    - ${q}`));
        }

        console.log('');
      } catch (err) {
        console.log(`\n  [Error: ${err instanceof Error ? err.message : err}]\n`);
      }

      ask();
    });
  };

  ask();
}

main().catch(err => { console.error(err); process.exit(1); });
