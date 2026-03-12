import { createFAQBot, FAQBot } from '../src/core/index.js';

let bot: FAQBot | null = null;

export async function getBot(): Promise<FAQBot> {
  if (!bot) {
    bot = await createFAQBot({
      database: { connectionString: process.env.DATABASE_URL! },
      companyName: process.env.COMPANY_NAME || 'Veent Tix',
      embedding: {
        provider: (process.env.EMBEDDING_PROVIDER as 'gemini' | 'ollama') || 'gemini',
        apiKey: process.env.GEMINI_API_KEY,
        baseUrl: process.env.OLLAMA_BASE_URL,
      },
      llm: {
        provider: (process.env.LLM_PROVIDER as 'gemini' | 'ollama') || 'gemini',
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.LLM_MODEL,
        baseUrl: process.env.OLLAMA_BASE_URL,
      },
    });
  }
  return bot;
}
