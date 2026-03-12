import pg from 'pg';
import type { EmbeddingService, RetrievalResult } from '../types.js';
import {
  searchByCombinedEmbedding, searchByQuestionEmbedding, searchByKeyword,
  searchChunksByEmbedding, searchChunksByKeyword,
} from '../database/queries.js';
import { reciprocalRankFusion } from './rrf.js';
import { routeToTier, type TierDecision } from './tier-router.js';

export { reciprocalRankFusion } from './rrf.js';
export { routeToTier } from './tier-router.js';
export type { TierDecision } from './tier-router.js';

export interface RetrievalPipelineConfig {
  thresholds: {
    exactMatch: number;
    ragGenerate: number;
    suggestRelated: number;
  };
  topK: number;
}

/**
 * Full retrieval pipeline:
 * 1. Embed the user query
 * 2. Run 5 parallel searches
 * 3. RRF-merge FAQ lists and chunk lists separately
 * 4. Interleave top FAQs and top chunks for balanced context
 * 5. Route to tier
 */
export async function retrieve(
  pool: pg.Pool,
  embeddingService: EmbeddingService,
  query: string,
  config: RetrievalPipelineConfig
): Promise<{ tierDecision: TierDecision; queryEmbedding: number[]; results: RetrievalResult[] }> {
  // Step 1: Embed the query
  const queryEmbedding = await embeddingService.embed(query);

  // Step 2: Run all searches in parallel
  // Retrieve more chunk candidates since they contain richer data (event details, docs)
  const chunkTopK = Math.max(config.topK, 8);
  const [combinedResults, questionResults, keywordResults, chunkVectorResults, chunkKeywordResults] = await Promise.all([
    searchByCombinedEmbedding(pool, queryEmbedding, config.topK),
    searchByQuestionEmbedding(pool, queryEmbedding, config.topK),
    searchByKeyword(pool, query, config.topK),
    searchChunksByEmbedding(pool, queryEmbedding, chunkTopK),
    searchChunksByKeyword(pool, query, chunkTopK),
  ]);

  // Normalize helpers
  const normalizeFaq = (r: { id: string; question: string; answer: string; category: string | null; score: string | number }) => ({
    id: r.id,
    question: r.question,
    answer: r.answer,
    category: r.category,
    score: typeof r.score === 'string' ? parseFloat(r.score) : r.score,
  });

  const normalizeChunk = (r: { id: string; heading: string; content: string; document_name: string; score: string | number }) => ({
    id: r.id,
    question: r.heading || r.document_name,
    answer: r.content,
    category: `doc:${r.document_name}`,
    score: typeof r.score === 'string' ? parseFloat(r.score) : r.score,
  });

  // Step 3: RRF-merge FAQ lists and chunk lists separately
  const faqMerged = reciprocalRankFusion([
    combinedResults.map(normalizeFaq),
    questionResults.map(normalizeFaq),
    keywordResults.map(normalizeFaq),
  ]);

  const chunkMerged = reciprocalRankFusion([
    chunkVectorResults.map(normalizeChunk),
    chunkKeywordResults.map(normalizeChunk),
  ]);

  // Step 4: Interleave FAQs and chunks with guaranteed slots for each.
  // Chunks contain specific data (events, policies) that is critical for data queries
  // but may score lower by vector similarity than generic FAQ entries.
  // Use round-robin to ensure both get fair representation in the LLM context.

  const topFaqs = faqMerged.slice(0, 5);
  const topChunks = chunkMerged.slice(0, 5);

  // Promote chunks with strong keyword matches to the FRONT of topChunks.
  // These may have ranked low in RRF (since vector search missed them), but they
  // contain specific data matching the user's keywords (e.g., "Events in April").
  const chunkKeywordNormalized = chunkKeywordResults.map(normalizeChunk);
  for (const raw of chunkKeywordNormalized.slice(0, 2)) {
    const score = typeof raw.score === 'string' ? parseFloat(raw.score) : raw.score;
    if (score <= 0.15) continue;

    const existingIdx = topChunks.findIndex(c => c.faqId === raw.id);
    if (existingIdx > 0) {
      // Already in list but not at front — move it to position 0
      const [item] = topChunks.splice(existingIdx, 1);
      topChunks.unshift(item);
    } else if (existingIdx < 0) {
      // Not in list at all — add to front
      topChunks.unshift({
        faqId: raw.id,
        question: raw.question,
        answer: raw.answer,
        category: raw.category,
        combinedScore: score,
        questionScore: 0,
        keywordScore: score,
        rrfScore: 0,
      });
    }
    // existingIdx === 0 means already at front, no action needed
  }

  // Round-robin interleave: FAQ, Chunk, FAQ, Chunk, ... then remaining
  const allResults: RetrievalResult[] = [];
  const seenIds = new Set<string>();
  const maxRounds = Math.max(topFaqs.length, topChunks.length);

  for (let i = 0; i < maxRounds; i++) {
    if (i < topFaqs.length && !seenIds.has(topFaqs[i].faqId)) {
      seenIds.add(topFaqs[i].faqId);
      allResults.push(topFaqs[i]);
    }
    if (i < topChunks.length && !seenIds.has(topChunks[i].faqId)) {
      seenIds.add(topChunks[i].faqId);
      allResults.push(topChunks[i]);
    }
  }

  // Step 5: Route to tier using the best overall result
  const tierDecision = routeToTier(allResults, config.thresholds);

  return { tierDecision, queryEmbedding, results: allResults };
}
