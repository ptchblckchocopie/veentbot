import { describe, it, expect } from 'vitest';
import { routeToTier } from '../../src/core/retrieval/tier-router.js';
import type { RetrievalResult } from '../../src/core/types.js';

const thresholds = { exactMatch: 0.78, ragGenerate: 0.65, suggestRelated: 0.52 };

function makeResult(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  return {
    faqId: 'test-id',
    question: 'Test question?',
    answer: 'Test answer.',
    category: 'test',
    combinedScore: 0,
    questionScore: 0,
    keywordScore: 0,
    rrfScore: 0,
    ...overrides,
  };
}

describe('Tier Router', () => {
  it('routes to exact when score >= exactMatch threshold', () => {
    const results = [makeResult({ combinedScore: 0.85, questionScore: 0.90 })];
    const decision = routeToTier(results, thresholds);

    expect(decision.tier).toBe('exact');
    expect(decision.confidence).toBe(0.90);
    expect(decision.topResult).not.toBeNull();
  });

  it('routes to rag when score is between ragGenerate and exactMatch', () => {
    const results = [
      makeResult({ faqId: 'a', combinedScore: 0.70, questionScore: 0.72 }),
      makeResult({ faqId: 'b', combinedScore: 0.65, questionScore: 0.68 }),
      makeResult({ faqId: 'c', combinedScore: 0.60, questionScore: 0.62 }),
    ];
    const decision = routeToTier(results, thresholds);

    expect(decision.tier).toBe('rag');
    expect(decision.contextResults.length).toBe(3); // Top 3 for LLM context
  });

  it('routes to decline with suggestions when below ragGenerate but above suggestRelated', () => {
    const results = [
      makeResult({ question: 'Related Q1?', combinedScore: 0.55, questionScore: 0.58 }),
      makeResult({ question: 'Related Q2?', combinedScore: 0.53, questionScore: 0.54 }),
    ];
    const decision = routeToTier(results, thresholds);

    expect(decision.tier).toBe('decline');
    expect(decision.suggestedQuestions.length).toBe(2);
    expect(decision.suggestedQuestions).toContain('Related Q1?');
  });

  it('routes to decline without suggestions when all scores are very low', () => {
    const results = [makeResult({ combinedScore: 0.30, questionScore: 0.35 })];
    const decision = routeToTier(results, thresholds);

    expect(decision.tier).toBe('decline');
    expect(decision.suggestedQuestions.length).toBe(0);
  });

  it('handles empty results', () => {
    const decision = routeToTier([], thresholds);

    expect(decision.tier).toBe('decline');
    expect(decision.topResult).toBeNull();
    expect(decision.confidence).toBe(0);
  });

  it('uses max of combinedScore and questionScore for confidence', () => {
    const results = [makeResult({ combinedScore: 0.60, questionScore: 0.85 })];
    const decision = routeToTier(results, thresholds);

    // questionScore (0.85) > exactMatch (0.78), so should be exact
    expect(decision.tier).toBe('exact');
    expect(decision.confidence).toBe(0.85);
  });
});
