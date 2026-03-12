import { FAQBot } from './bot.js';
import { buildConfig } from './config.js';
import type { FAQBotConfig } from './types.js';

export async function createFAQBot(
  partialConfig: Partial<FAQBotConfig> & Pick<FAQBotConfig, 'database' | 'companyName'>
): Promise<FAQBot> {
  const config = buildConfig(partialConfig);
  const bot = new FAQBot(config);
  await bot.init();
  return bot;
}

export { FAQBot } from './bot.js';
export { buildConfig } from './config.js';
export * from './types.js';
