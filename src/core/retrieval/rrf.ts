import type { RetrievalResult } from '../types.js';

interface RankedItem {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  score: number;
}

/**
 * Reciprocal Rank Fusion — merges multiple ranked lists into one.
 * rrf_score = Σ(1 / (k + rank))  where k = 60
 */
export function reciprocalRankFusion(
  rankedLists: RankedItem[][],
  k: number = 60
): RetrievalResult[] {
  const scores = new Map<string, RetrievalResult>();

  for (const items of rankedLists) {
    items.forEach((item, rank) => {
      const existing = scores.get(item.id);
      const rrfContribution = 1 / (k + rank + 1);

      if (existing) {
        existing.rrfScore += rrfContribution;
        // Track the best raw similarity score
        existing.combinedScore = Math.max(existing.combinedScore, item.score);
      } else {
        scores.set(item.id, {
          faqId: item.id,
          question: item.question,
          answer: item.answer,
          category: item.category,
          combinedScore: item.score,
          questionScore: 0,
          keywordScore: 0,
          rrfScore: rrfContribution,
        });
      }
    });
  }

  // Sort by RRF score descending
  return Array.from(scores.values()).sort((a, b) => b.rrfScore - a.rrfScore);
}
