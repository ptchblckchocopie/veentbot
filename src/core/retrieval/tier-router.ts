import type { Tier, RetrievalResult } from '../types.js';

export interface TierDecision {
  tier: Tier;
  topResult: RetrievalResult | null;
  contextResults: RetrievalResult[];   // Top-3 for Tier 2 LLM context
  suggestedQuestions: string[];         // For Tier 3 decline
  confidence: number;                  // Best similarity score
}

export function routeToTier(
  results: RetrievalResult[],
  thresholds: { exactMatch: number; ragGenerate: number; suggestRelated: number }
): TierDecision {
  if (results.length === 0) {
    return {
      tier: 'decline',
      topResult: null,
      contextResults: [],
      suggestedQuestions: [],
      confidence: 0,
    };
  }

  const topResult = results[0];
  // Use the best individual similarity score (max of combined and question scores)
  const confidence = Math.max(topResult.combinedScore, topResult.questionScore);

  if (confidence >= thresholds.exactMatch) {
    // Tier 1: Exact match — return stored answer directly
    return {
      tier: 'exact',
      topResult,
      contextResults: [topResult],
      suggestedQuestions: [],
      confidence,
    };
  }

  if (confidence >= thresholds.ragGenerate) {
    // Tier 2: RAG — pass top results to LLM (mix of FAQs and doc chunks)
    return {
      tier: 'rag',
      topResult,
      contextResults: results.slice(0, 8),
      suggestedQuestions: [],
      confidence,
    };
  }

  // Tier 3: Decline — suggest related questions if any are above threshold
  const suggestedQuestions = results
    .filter(r => Math.max(r.combinedScore, r.questionScore) >= thresholds.suggestRelated)
    .slice(0, 3)
    .map(r => r.question);

  return {
    tier: 'decline',
    topResult: results[0] || null,
    contextResults: [],
    suggestedQuestions,
    confidence,
  };
}
