// ============================================================
// Configuration
// ============================================================

export interface FAQBotConfig {
  database: {
    connectionString: string;
  };
  embedding: {
    provider: 'ollama' | 'gemini' | 'custom';
    baseUrl?: string;       // Ollama: http://localhost:11434
    apiKey?: string;        // Gemini: API key
    model?: string;         // default: nomic-embed-text
    dimensions?: number;    // default: 768
  };
  llm: {
    provider: 'gemini' | 'ollama' | 'custom';
    apiKey?: string;
    model?: string;         // default: gemini-2.5-flash-lite
    maxTokens?: number;     // default: 300
    baseUrl?: string;
  };
  thresholds: {
    exactMatch: number;     // default: 0.92
    ragGenerate: number;    // default: 0.75
    suggestRelated: number; // default: 0.50
  };
  cache: {
    enabled: boolean;       // default: true
    ttlSeconds: number;     // default: 86400
    similarityThreshold: number; // default: 0.97
  };
  companyName: string;
  systemPromptOverride?: string;
}

// ============================================================
// FAQ Data
// ============================================================

export interface FAQEntry {
  id?: string;
  question: string;
  answer: string;
  category?: string;
  metadata?: Record<string, unknown>;
  payloadCmsId?: string;
}

export interface FAQEntryWithEmbeddings extends FAQEntry {
  id: string;
  embeddingCombined: number[];
  embeddingQuestion: number[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// Query & Response
// ============================================================

export type Tier = 'exact' | 'rag' | 'decline';

export interface QueryResponse {
  answer: string;
  confidence: number;
  tier: Tier;
  matchedFaqIds: string[];
  suggestedQuestions: string[];
  sessionId: string;
  cached: boolean;
}

export interface RetrievalResult {
  faqId: string;
  question: string;
  answer: string;
  category: string | null;
  combinedScore: number;
  questionScore: number;
  keywordScore: number;
  rrfScore: number;
}

// ============================================================
// Embedding & LLM Services
// ============================================================

export interface EmbeddingService {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface LLMService {
  generate(systemPrompt: string, userMessage: string): Promise<LLMResponse>;
}

export interface LLMResponse {
  text: string;
  model: string;
  tokensUsed: number;
}

// ============================================================
// Feedback & Learning
// ============================================================

export type FeedbackRating = 'positive' | 'negative';

export interface Feedback {
  messageId: string;
  sessionId: string;
  rating: FeedbackRating;
  comment?: string;
}

export interface KnowledgeGap {
  id: string;
  representativeQuestion: string;
  sampleQueries: string[];
  clusterSize: number;
  priority: 'high' | 'medium' | 'low';
  suggestedCategory?: string;
  status: 'pending' | 'approved' | 'dismissed';
}

export interface ImprovementSuggestion {
  id: string;
  faqEntryId: string;
  suggestionType: 'rephrase_question' | 'expand_answer' | 'create_composite' | 'update_stale';
  suggestionText: string;
  evidence: Record<string, unknown>;
  status: 'pending' | 'approved' | 'dismissed';
}
