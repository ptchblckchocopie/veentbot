import { describe, it, expect } from 'vitest';
import { reciprocalRankFusion } from '../../src/core/retrieval/rrf.js';

const makeFaq = (id: string, score: number) => ({
  id, question: `Q ${id}`, answer: `A ${id}`, category: null, score,
});

describe('Reciprocal Rank Fusion', () => {
  it('merges results from multiple lists', () => {
    const combined = [makeFaq('a', 0.9), makeFaq('b', 0.8)];
    const question = [makeFaq('b', 0.95), makeFaq('c', 0.7)];
    const keyword = [makeFaq('a', 0.5)];

    const results = reciprocalRankFusion([combined, question, keyword]);

    // 'a' appears in combined (rank 1) + keyword (rank 1) → highest RRF
    // 'b' appears in combined (rank 2) + question (rank 1)
    expect(results.length).toBe(3);
    expect(results[0].faqId).toBe('a'); // In 2 lists at rank 1
    expect(results[1].faqId).toBe('b'); // In 2 lists
    expect(results[2].faqId).toBe('c'); // In 1 list
  });

  it('returns empty array for empty inputs', () => {
    const results = reciprocalRankFusion([[], [], []]);
    expect(results).toEqual([]);
  });

  it('preserves individual scores', () => {
    const combined = [makeFaq('a', 0.85)];
    const question = [makeFaq('a', 0.92)];

    const results = reciprocalRankFusion([combined, question, []]);

    // combinedScore takes the max from all lists the item appears in
    expect(results[0].combinedScore).toBe(0.92);
    expect(results[0].rrfScore).toBeGreaterThan(0);
  });

  it('ranks by RRF score not individual scores', () => {
    // 'a' has high score but only in one list
    // 'b' has lower scores but appears in all three lists
    const combined = [makeFaq('a', 0.99), makeFaq('b', 0.6)];
    const question = [makeFaq('b', 0.5)];
    const keyword = [makeFaq('b', 0.4)];

    const results = reciprocalRankFusion([combined, question, keyword]);

    // 'b' should rank higher — it appears in all 3 lists
    expect(results[0].faqId).toBe('b');
  });
});
