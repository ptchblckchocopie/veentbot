import type { FAQBotConfig } from './types.js';

const defaults: Omit<FAQBotConfig, 'database' | 'companyName'> = {
  embedding: {
    provider: 'ollama',
    baseUrl: 'http://localhost:11434',
    model: 'nomic-embed-text',
    dimensions: 768,
  },
  llm: {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    maxTokens: 800,
  },
  thresholds: {
    exactMatch: 0.75,
    ragGenerate: 0.55,
    suggestRelated: 0.35,
  },
  cache: {
    enabled: true,
    ttlSeconds: 86400,
    similarityThreshold: 0.97,
  },
};

export function buildConfig(partial: Partial<FAQBotConfig> & Pick<FAQBotConfig, 'database' | 'companyName'>): FAQBotConfig {
  const embeddingDefaults = partial.embedding?.provider === 'gemini'
    ? { provider: 'gemini' as const, model: 'gemini-embedding-001', dimensions: 768 }
    : defaults.embedding;

  return {
    database: partial.database,
    companyName: partial.companyName,
    embedding: { ...embeddingDefaults, ...partial.embedding },
    llm: { ...defaults.llm, ...partial.llm },
    thresholds: { ...defaults.thresholds, ...partial.thresholds },
    cache: { ...defaults.cache, ...partial.cache },
    systemPromptOverride: partial.systemPromptOverride,
  };
}
