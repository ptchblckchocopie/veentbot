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
        provider: 'gemini',
        apiKey: process.env.GEMINI_API_KEY || '',
      },
    });
  }
  return bot;
}

export async function cleanup() {
  await closeDatabase();
  bot = null;
}
