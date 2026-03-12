import pg from 'pg';
import type { FAQBotConfig, FAQEntry, QueryResponse, EmbeddingService } from './types.js';
import { getPool, initDatabase } from './database/index.js';
import * as queries from './database/queries.js';
import { retrieve } from './retrieval/index.js';
import { buildSystemPrompt, buildUserMessage, buildDeclineMessage, buildRewritePrompt } from './llm/prompts.js';
import type { ConversationTurn } from './llm/prompts.js';
import { OllamaEmbeddingService } from './embedding/ollama.js';
import { GeminiEmbeddingService } from './embedding/gemini.js';
import { GeminiLLMService } from './llm/gemini.js';
import { OllamaLLMService } from './llm/ollama.js';
import type { ChatMessage } from './llm/gemini.js';
import { sanitizeInput } from './security/sanitize.js';
import { checkPromptInjection, validateOutput } from './security/guardrails.js';
import { correctTypos } from './security/spellcheck.js';
import { detectIntent } from './intent/detector.js';

// Max conversation turns to keep in context (user+assistant pairs)
const MAX_HISTORY_TURNS = 6;

// Short queries that likely refer to previous context
const FOLLOW_UP_PATTERNS = /^(how much|what about|and |tell me more|can you|is it|are they|where|when|which|why|how|do they|does it|what's|whats|what are|how about|same|also|too|that|this|those|these|it |they )/i;

export class FAQBot {
  private pool: pg.Pool;
  private embeddingService: EmbeddingService;
  private llmService: GeminiLLMService | OllamaLLMService;
  private config: FAQBotConfig;

  constructor(config: FAQBotConfig) {
    this.config = config;
    this.pool = getPool(config.database.connectionString);

    // Initialize embedding service
    if (config.embedding.provider === 'ollama') {
      this.embeddingService = new OllamaEmbeddingService(
        config.embedding.baseUrl,
        config.embedding.model
      );
    } else if (config.embedding.provider === 'gemini') {
      this.embeddingService = new GeminiEmbeddingService(
        config.embedding.apiKey!,
        config.embedding.model || 'text-embedding-004'
      );
    } else {
      throw new Error(`Unsupported embedding provider: ${config.embedding.provider}`);
    }

    // Initialize LLM service
    if (config.llm.provider === 'gemini') {
      this.llmService = new GeminiLLMService(
        config.llm.apiKey!,
        config.llm.model,
        config.llm.maxTokens
      );
    } else if (config.llm.provider === 'ollama') {
      this.llmService = new OllamaLLMService(
        config.llm.baseUrl || 'http://localhost:11434',
        config.llm.model || 'qwen2.5:3b',
        config.llm.maxTokens
      );
    } else {
      throw new Error(`Unsupported LLM provider: ${config.llm.provider}`);
    }
  }

  async init(): Promise<void> {
    await initDatabase(this.config.database.connectionString);
  }

  // ============================================================
  // MAIN QUERY PIPELINE
  // ============================================================

  async query(question: string, sessionId?: string): Promise<QueryResponse> {
    // Security: sanitize input
    const sanitized = sanitizeInput(question);
    if (sanitized.rejected) {
      return {
        answer: sanitized.reason || 'Invalid input.',
        confidence: 0,
        tier: 'decline',
        matchedFaqIds: [],
        suggestedQuestions: [],
        sessionId: sessionId || '',
        cached: false,
      };
    }
    question = sanitized.text;

    // Typo correction (before injection check — corrected text is safer to check)
    question = correctTypos(question);

    // Security: check for prompt injection
    const injection = checkPromptInjection(question);
    if (injection.flagged) {
      return {
        answer: "I can only help with questions about our company and services. Could you rephrase your question?",
        confidence: 0,
        tier: 'decline',
        matchedFaqIds: [],
        suggestedQuestions: [],
        sessionId: sessionId || '',
        cached: false,
      };
    }

    // Create or reuse session
    const sid = sessionId || await queries.createSession(this.pool);

    // Intent detection — catch greetings, thanks, goodbyes, help requests
    // before hitting the retrieval pipeline
    const intent = detectIntent(question);
    if (intent.response) {
      await queries.logMessage(this.pool, sid, 'user', question, null, null, null, null, 0);
      await queries.logMessage(this.pool, sid, 'assistant', intent.response, null, intent.confidence, 'exact', null, 0);
      return {
        answer: intent.response,
        confidence: intent.confidence,
        tier: 'exact',
        matchedFaqIds: [],
        suggestedQuestions: intent.suggestedQuestions,
        sessionId: sid,
        cached: false,
      };
    }

    // Fetch conversation history for multi-turn context
    const history = await this.getConversationHistory(sid);

    // Log user message
    await queries.logMessage(this.pool, sid, 'user', question, null, null, null, null, 0);

    // Query rewriting: if this looks like a follow-up, enrich the search query
    // with context from the conversation (no extra LLM call needed)
    let searchQuery = question;
    if (history.length > 0 && this.isFollowUp(question)) {
      searchQuery = this.enrichFollowUpQuery(question, history);
      if (searchQuery !== question) {
        console.log(`Query enriched: "${question}" → "${searchQuery}"`);
      }
    }

    // Step 1: Check semantic cache (using rewritten query)
    if (this.config.cache.enabled && history.length === 0) {
      // Only use cache for first-turn queries (follow-ups need fresh context)
      const queryEmbedding = await this.embeddingService.embed(searchQuery);
      const cached = await queries.findCachedResponse(
        this.pool, queryEmbedding, this.config.cache.similarityThreshold
      );
      if (cached) {
        await queries.logMessage(this.pool, sid, 'assistant', cached.response_text, null, cached.score, 'exact', null, 0);
        return {
          answer: cached.response_text,
          confidence: cached.score,
          tier: 'exact',
          matchedFaqIds: cached.faq_entry_ids || [],
          suggestedQuestions: [],
          sessionId: sid,
          cached: true,
        };
      }
    }

    // Step 2: Full retrieval pipeline (using rewritten query for better search)
    const { tierDecision, queryEmbedding, results } = await retrieve(
      this.pool,
      this.embeddingService,
      searchQuery,
      { thresholds: this.config.thresholds, topK: 10 }
    );

    // Only use faqId for actual FAQ entries, not knowledge chunks
    const getFaqId = (result: { faqId: string; category: string | null } | null) =>
      result && !result.category?.startsWith('doc:') ? result.faqId : null;

    const matchedFaqId = tierDecision.topResult ? getFaqId(tierDecision.topResult) : null;

    // Step 3: Generate response through LLM for ALL tiers
    let answer: string;
    let llmModel: string | null = null;
    let tokensUsed = 0;

    const systemPrompt = this.config.systemPromptOverride || buildSystemPrompt(this.config.companyName);

    if (tierDecision.tier === 'decline' && tierDecision.suggestedQuestions.length === 0) {
      // Hard decline — no relevant context at all, skip LLM
      answer = buildDeclineMessage([]);
    } else {
      // Use LLM for exact, rag, and soft-decline (has suggestions)
      const contextResults = tierDecision.tier === 'decline'
        ? results.slice(0, 3) // Give LLM some context even for declines
        : tierDecision.contextResults;

      try {
        // Build the context + question message (no history — it goes via multi-turn API)
        const userMessage = buildUserMessage(question, contextResults);

        // Build multi-turn messages for Gemini
        const messages: ChatMessage[] = [];

        // Add recent history as actual conversation turns
        for (const turn of history.slice(-MAX_HISTORY_TURNS)) {
          messages.push({
            role: turn.role === 'user' ? 'user' : 'model',
            text: turn.content,
          });
        }

        // Add the current context + question as the final user message
        messages.push({ role: 'user', text: userMessage });

        const llmResponse = await this.llmService.chat(systemPrompt, messages);
        llmModel = llmResponse.model;
        tokensUsed = llmResponse.tokensUsed;

        // Security: validate LLM output
        if (!validateOutput(llmResponse.text, systemPrompt)) {
          answer = tierDecision.topResult?.answer || buildDeclineMessage(tierDecision.suggestedQuestions);
        } else {
          answer = llmResponse.text;
        }

        // Cache first-turn responses
        if (this.config.cache.enabled && history.length === 0 && tierDecision.tier !== 'decline') {
          const faqIds = contextResults.map(r => r.faqId);
          await queries.cacheResponse(
            this.pool, queryEmbedding, searchQuery, answer, faqIds, this.config.cache.ttlSeconds
          );
        }
      } catch (err) {
        // LLM failed — fall back gracefully
        console.error('LLM generation failed:', (err as Error).message);
        answer = this.buildFallbackAnswer(contextResults, tierDecision.suggestedQuestions);
      }
    }

    // Log assistant response
    await queries.logMessage(
      this.pool, sid, 'assistant', answer,
      matchedFaqId, tierDecision.confidence, tierDecision.tier,
      llmModel, tokensUsed
    );

    return {
      answer,
      confidence: tierDecision.confidence,
      tier: tierDecision.tier,
      matchedFaqIds: matchedFaqId ? [matchedFaqId] : [],
      suggestedQuestions: tierDecision.suggestedQuestions,
      sessionId: sid,
      cached: false,
    };
  }

  // ============================================================
  // CONVERSATION HISTORY
  // ============================================================

  private async getConversationHistory(sessionId: string): Promise<ConversationTurn[]> {
    try {
      const messages = await queries.getSessionMessages(this.pool, sessionId);
      return messages
        .slice(-MAX_HISTORY_TURNS * 2) // Keep last N turns (user + assistant)
        .map((m: { role: string; content: string }) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));
    } catch {
      return [];
    }
  }

  /**
   * Detect if a query is likely a follow-up to previous conversation.
   */
  private isFollowUp(query: string): boolean {
    if (query.split(/\s+/).length <= 4) return true;
    if (FOLLOW_UP_PATTERNS.test(query)) return true;
    return false;
  }

  /**
   * Enrich a follow-up query with context from conversation history.
   * Extracts the main topic from the conversation and combines with current query.
   * No LLM call needed — pure string extraction.
   */
  private enrichFollowUpQuery(query: string, history: ConversationTurn[]): string {
    // Find the first substantive user question (the main topic of conversation)
    const userMessages = history.filter(h => h.role === 'user');
    if (userMessages.length === 0) return query;

    // Use the first user message as the topic anchor, unless it's very generic
    // Fall back to the most recent one if the first is too short
    let topicMsg = userMessages[0];
    if (topicMsg.content.split(/\s+/).length <= 3 && userMessages.length > 1) {
      topicMsg = userMessages[userMessages.length - 1];
    }

    // Strip common question prefixes to extract the core topic
    const topic = topicMsg.content
      .replace(/^(tell me about|what is|what are|how about|show me|i want to know about|can you tell me about|what's)\s+/i, '')
      .replace(/[?.!]+$/, '')
      .trim();

    return `${topic} ${query}`;
  }

  // ============================================================
  // STREAMING QUERY PIPELINE
  // ============================================================

  /**
   * Streaming version of query(). Yields text chunks via an async generator.
   * Tier 1 (exact) yields the full answer in one chunk.
   * Tier 2 (RAG) streams from the LLM.
   * Tier 3 (decline) yields the decline message in one chunk.
   */
  async *queryStream(question: string, sessionId?: string): AsyncGenerator<
    { type: 'chunk'; text: string } | { type: 'meta'; data: Omit<QueryResponse, 'answer'> },
    void
  > {
    // Security: sanitize input
    const sanitized = sanitizeInput(question);
    if (sanitized.rejected) {
      yield { type: 'chunk', text: sanitized.reason || 'Invalid input.' };
      yield { type: 'meta', data: { confidence: 0, tier: 'decline', matchedFaqIds: [], suggestedQuestions: [], sessionId: sessionId || '', cached: false } };
      return;
    }
    question = sanitized.text;

    // Typo correction
    question = correctTypos(question);

    // Prompt injection check
    const injection = checkPromptInjection(question);
    if (injection.flagged) {
      const msg = "I can only help with questions about our company and services. Could you rephrase your question?";
      yield { type: 'chunk', text: msg };
      yield { type: 'meta', data: { confidence: 0, tier: 'decline', matchedFaqIds: [], suggestedQuestions: [], sessionId: sessionId || '', cached: false } };
      return;
    }

    const sid = sessionId || await queries.createSession(this.pool);

    // Intent detection for conversational patterns
    const intent = detectIntent(question);
    if (intent.response) {
      await queries.logMessage(this.pool, sid, 'user', question, null, null, null, null, 0);
      await queries.logMessage(this.pool, sid, 'assistant', intent.response, null, intent.confidence, 'exact', null, 0);
      yield { type: 'chunk', text: intent.response };
      yield { type: 'meta', data: { confidence: intent.confidence, tier: 'exact', matchedFaqIds: [], suggestedQuestions: intent.suggestedQuestions, sessionId: sid, cached: false } };
      return;
    }

    const history = await this.getConversationHistory(sid);
    await queries.logMessage(this.pool, sid, 'user', question, null, null, null, null, 0);

    // Query enrichment for follow-ups
    let searchQuery = question;
    if (history.length > 0 && this.isFollowUp(question)) {
      searchQuery = this.enrichFollowUpQuery(question, history);
    }

    // Cache check (first-turn only)
    if (this.config.cache.enabled && history.length === 0) {
      const queryEmbedding = await this.embeddingService.embed(searchQuery);
      const cached = await queries.findCachedResponse(this.pool, queryEmbedding, this.config.cache.similarityThreshold);
      if (cached) {
        await queries.logMessage(this.pool, sid, 'assistant', cached.response_text, null, cached.score, 'exact', null, 0);
        yield { type: 'chunk', text: cached.response_text };
        yield { type: 'meta', data: { confidence: cached.score, tier: 'exact', matchedFaqIds: cached.faq_entry_ids || [], suggestedQuestions: [], sessionId: sid, cached: true } };
        return;
      }
    }

    // Retrieval
    const { tierDecision, queryEmbedding, results } = await retrieve(
      this.pool, this.embeddingService, searchQuery, { thresholds: this.config.thresholds, topK: 10 }
    );

    const getFaqId = (result: { faqId: string; category: string | null } | null) =>
      result && !result.category?.startsWith('doc:') ? result.faqId : null;
    const matchedFaqId = tierDecision.topResult ? getFaqId(tierDecision.topResult) : null;

    const systemPrompt = this.config.systemPromptOverride || buildSystemPrompt(this.config.companyName);

    if (tierDecision.tier === 'decline' && tierDecision.suggestedQuestions.length === 0) {
      // Hard decline
      const answer = buildDeclineMessage([]);
      await queries.logMessage(this.pool, sid, 'assistant', answer, matchedFaqId, tierDecision.confidence, 'decline', null, 0);
      yield { type: 'chunk', text: answer };
      yield { type: 'meta', data: { confidence: tierDecision.confidence, tier: 'decline', matchedFaqIds: [], suggestedQuestions: [], sessionId: sid, cached: false } };
      return;
    }

    // Stream from LLM
    const contextResults = tierDecision.tier === 'decline' ? results.slice(0, 3) : tierDecision.contextResults;
    const userMessage = buildUserMessage(question, contextResults);
    const messages: ChatMessage[] = [];
    for (const turn of history.slice(-MAX_HISTORY_TURNS)) {
      messages.push({ role: turn.role === 'user' ? 'user' : 'model', text: turn.content });
    }
    messages.push({ role: 'user', text: userMessage });

    let fullAnswer = '';
    let llmModel: string | null = null;
    let tokensUsed = 0;

    try {
      const stream = this.llmService.chatStream(systemPrompt, messages);
      while (true) {
        const { done, value } = await stream.next();
        if (done) {
          // The return value contains the final metadata
          if (value) {
            llmModel = value.model;
            tokensUsed = value.tokensUsed;
          }
          break;
        }
        fullAnswer += value;
        yield { type: 'chunk', text: value };
      }
    } catch (err) {
      console.error('LLM stream failed:', (err as Error).message);
      fullAnswer = this.buildFallbackAnswer(contextResults, tierDecision.suggestedQuestions);
      yield { type: 'chunk', text: fullAnswer };
    }

    // Validate and log
    if (!validateOutput(fullAnswer, systemPrompt)) {
      fullAnswer = tierDecision.topResult?.answer || buildDeclineMessage(tierDecision.suggestedQuestions);
    }

    await queries.logMessage(this.pool, sid, 'assistant', fullAnswer, matchedFaqId, tierDecision.confidence, tierDecision.tier, llmModel, tokensUsed);

    // Cache first-turn responses
    if (this.config.cache.enabled && history.length === 0 && tierDecision.tier !== 'decline') {
      const faqIds = contextResults.map(r => r.faqId);
      await queries.cacheResponse(this.pool, queryEmbedding, searchQuery, fullAnswer, faqIds, this.config.cache.ttlSeconds);
    }

    yield { type: 'meta', data: {
      confidence: tierDecision.confidence,
      tier: tierDecision.tier,
      matchedFaqIds: matchedFaqId ? [matchedFaqId] : [],
      suggestedQuestions: tierDecision.suggestedQuestions,
      sessionId: sid,
      cached: false,
    }};
  }

  // ============================================================
  // FALLBACK ANSWER (when LLM is unavailable)
  // ============================================================

  /**
   * Build a fallback answer from context results when the LLM is unavailable.
   * Prefers knowledge chunks (doc:*) over generic FAQ answers since chunks
   * contain specific data like event listings, policies, etc.
   * Among chunks, prefers longer content (more data).
   */
  private buildFallbackAnswer(contextResults: RetrievalResult[], suggestedQuestions: string[]): string {
    if (contextResults.length === 0) {
      return buildDeclineMessage(suggestedQuestions);
    }

    const chunks = contextResults.filter(r => r.category?.startsWith('doc:'));
    if (chunks.length > 0) {
      // Prefer the longest chunk — it has the most specific data
      const best = chunks.reduce((a, b) => b.answer.length > a.answer.length ? b : a);
      return best.answer;
    }

    return contextResults[0].answer;
  }

  // ============================================================
  // FAQ MANAGEMENT
  // ============================================================

  async seedFAQs(entries: FAQEntry[]): Promise<string[]> {
    const ids: string[] = [];

    for (const entry of entries) {
      const combinedText = `Question: ${entry.question}\nAnswer: ${entry.answer}`;
      const [embCombined, embQuestion] = await this.embeddingService.embedBatch([
        combinedText,
        entry.question,
      ]);

      const id = await queries.upsertFAQ(
        this.pool,
        entry.id || null,
        entry.question,
        entry.answer,
        entry.category || null,
        embCombined,
        embQuestion,
        entry.metadata || {},
        entry.payloadCmsId || null
      );
      ids.push(id);
    }

    return ids;
  }

  async upsertFAQ(entry: FAQEntry): Promise<string> {
    const ids = await this.seedFAQs([entry]);
    if (entry.id) {
      await queries.invalidateCacheForFAQs(this.pool, [entry.id]);
    }
    return ids[0];
  }

  async deleteFAQ(id: string): Promise<void> {
    await queries.softDeleteFAQ(this.pool, id);
    await queries.invalidateCacheForFAQs(this.pool, [id]);
  }

  // ============================================================
  // FEEDBACK
  // ============================================================

  async submitFeedback(messageId: string, sessionId: string, rating: 'positive' | 'negative', comment?: string): Promise<void> {
    const messages = await queries.getSessionMessages(this.pool, sessionId);
    const message = messages.find((m: { id: string }) => m.id === messageId);
    await queries.saveFeedback(
      this.pool, messageId, sessionId, rating,
      comment || null,
      message?.faq_entry_id || null,
      message?.tier || null
    );
  }

  // ============================================================
  // CONTINUOUS LEARNING
  // ============================================================

  async getKnowledgeGaps(sinceDays = 30) {
    const { detectGaps } = await import('./learning/gap-detector.js');
    return detectGaps(this.pool, (text) => this.embeddingService.embed(text), { sinceDays });
  }

  async saveDetectedGaps(gaps: Array<{ representativeQuestion: string; sampleQueries: string[]; clusterSize: number; priority: string }>) {
    const { saveGaps } = await import('./learning/review-queue.js');
    return saveGaps(this.pool, gaps);
  }

  async getFlaggedFAQs(sinceDays = 7) {
    const { analyzeFeedback } = await import('./learning/feedback-analyzer.js');
    return analyzeFeedback(this.pool, { sinceDays });
  }

  async getStaleEntries(staleDays = 90) {
    const { detectStaleEntries } = await import('./learning/stale-detector.js');
    return detectStaleEntries(this.pool, { staleDays });
  }

  async getThresholdReport(sinceDays = 7) {
    const { generateThresholdReport } = await import('./learning/threshold-advisor.js');
    return generateThresholdReport(this.pool, this.config.thresholds, { sinceDays });
  }

  async getReviewQueue() {
    const { getReviewQueue } = await import('./learning/review-queue.js');
    return getReviewQueue(this.pool);
  }

  async approveGap(gapId: string, faqData: { question: string; answer: string; category?: string }) {
    const { approveGap } = await import('./learning/review-queue.js');
    const faqId = await approveGap(this.pool, gapId, faqData);
    await this.upsertFAQ({ id: faqId, ...faqData });
    return faqId;
  }

  async dismissGap(gapId: string) {
    const { dismissGap } = await import('./learning/review-queue.js');
    return dismissGap(this.pool, gapId);
  }

  // ============================================================
  // UTILITIES
  // ============================================================

  async getSession(sessionId: string) {
    return queries.getSessionMessages(this.pool, sessionId);
  }

  async getAllFAQs() {
    return queries.getAllActiveFAQs(this.pool);
  }

  async healthCheck(): Promise<{ database: boolean; embedding: boolean }> {
    let database = false;
    let embedding = false;

    try {
      await this.pool.query('SELECT 1');
      database = true;
    } catch { /* noop */ }

    try {
      await this.embeddingService.embed('test');
      embedding = true;
    } catch { /* noop */ }

    return { database, embedding };
  }
}
