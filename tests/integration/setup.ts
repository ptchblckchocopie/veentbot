import { createFAQBot, type FAQBot } from '../../src/core/index.js';
import { closeDatabase } from '../../src/core/database/index.js';
import 'dotenv/config';

let bot: FAQBot | null = null;

export async function getTestBot(): Promise<FAQBot> {
  if (!bot) {
    bot = await createFAQBot({
      database: { connectionString: process.env.DATABASE_URL! },
      companyName: 'TestCompany',
      embedding: {
        provider: 'ollama',
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      },
      llm: {
        provider: (process.env.LLM_PROVIDER as 'gemini' | 'ollama') || 'ollama',
        apiKey: process.env.GEMINI_API_KEY || '',
        model: process.env.LLM_MODEL,
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      },
    });
  }
  return bot;
}

export async function cleanup() {
  await closeDatabase();
  bot = null;
}
