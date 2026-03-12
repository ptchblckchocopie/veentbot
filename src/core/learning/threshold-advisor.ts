import pg from 'pg';

export interface ThresholdReport {
  currentThresholds: { exactMatch: number; ragGenerate: number; suggestRelated: number };
  recommendations: ThresholdRecommendation[];
  stats: {
    totalQueries: number;
    tier1Count: number;
    tier2Count: number;
    tier3Count: number;
    tier1PositiveRate: number;
    tier2PositiveRate: number;
    avgTier1Confidence: number;
    avgTier2Confidence: number;
  };
}

export interface ThresholdRecommendation {
  threshold: 'exactMatch' | 'ragGenerate' | 'suggestRelated';
  currentValue: number;
  suggestedValue: number;
  reason: string;
}

/**
 * Analyzes production query data to recommend threshold adjustments.
 * Never auto-modifies — outputs recommendations for human review.
 */
export async function generateThresholdReport(
  pool: pg.Pool,
  currentThresholds: { exactMatch: number; ragGenerate: number; suggestRelated: number },
  options: { sinceDays?: number } = {}
): Promise<ThresholdReport> {
  const { sinceDays = 7 } = options;

  // Get tier distribution and feedback rates
  const stats = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE cm.tier IS NOT NULL) AS total_queries,
       COUNT(*) FILTER (WHERE cm.tier = 'exact') AS tier1_count,
       COUNT(*) FILTER (WHERE cm.tier = 'rag') AS tier2_count,
       COUNT(*) FILTER (WHERE cm.tier = 'decline') AS tier3_count,
       AVG(cm.similarity_score) FILTER (WHERE cm.tier = 'exact') AS avg_tier1_conf,
       AVG(cm.similarity_score) FILTER (WHERE cm.tier = 'rag') AS avg_tier2_conf
     FROM chat_messages cm
     WHERE cm.role = 'assistant'
       AND cm.created_at > now() - $1 * interval '1 day'`,
    [sinceDays]
  );

  // Get feedback rates per tier
  const feedbackStats = await pool.query(
    `SELECT
       f.tier,
       COUNT(*) FILTER (WHERE f.rating = 'positive') AS positive,
       COUNT(*) AS total
     FROM feedback f
     WHERE f.created_at > now() - $1 * interval '1 day'
     GROUP BY f.tier`,
    [sinceDays]
  );

  const row = stats.rows[0];
  const totalQueries = parseInt(row.total_queries) || 0;
  const tier1Count = parseInt(row.tier1_count) || 0;
  const tier2Count = parseInt(row.tier2_count) || 0;
  const tier3Count = parseInt(row.tier3_count) || 0;
  const avgTier1Confidence = parseFloat(row.avg_tier1_conf) || 0;
  const avgTier2Confidence = parseFloat(row.avg_tier2_conf) || 0;

  // Calculate feedback rates
  let tier1PositiveRate = 1;
  let tier2PositiveRate = 1;
  for (const fb of feedbackStats.rows) {
    const rate = parseInt(fb.total) > 0 ? parseInt(fb.positive) / parseInt(fb.total) : 1;
    if (fb.tier === 'exact') tier1PositiveRate = rate;
    if (fb.tier === 'rag') tier2PositiveRate = rate;
  }

  // Generate recommendations
  const recommendations: ThresholdRecommendation[] = [];

  // If Tier 1 has very high satisfaction and many Tier 2 queries score close to threshold
  if (tier1PositiveRate > 0.95 && avgTier2Confidence > currentThresholds.exactMatch - 0.08) {
    recommendations.push({
      threshold: 'exactMatch',
      currentValue: currentThresholds.exactMatch,
      suggestedValue: Math.round((currentThresholds.exactMatch - 0.05) * 100) / 100,
      reason: `Tier 1 satisfaction is ${(tier1PositiveRate * 100).toFixed(0)}% and Tier 2 queries average ${avgTier2Confidence.toFixed(3)} confidence. Lowering threshold would route more queries to the faster, cheaper Tier 1.`,
    });
  }

  // If Tier 2 has low satisfaction, tighten it
  if (tier2PositiveRate < 0.85 && tier2Count > 5) {
    recommendations.push({
      threshold: 'ragGenerate',
      currentValue: currentThresholds.ragGenerate,
      suggestedValue: Math.round((currentThresholds.ragGenerate + 0.03) * 100) / 100,
      reason: `Tier 2 satisfaction is only ${(tier2PositiveRate * 100).toFixed(0)}%. Raising threshold would send only higher-confidence queries to LLM generation.`,
    });
  }

  // If too many in-scope queries are being declined
  if (tier3Count > totalQueries * 0.3 && totalQueries > 20) {
    recommendations.push({
      threshold: 'suggestRelated',
      currentValue: currentThresholds.suggestRelated,
      suggestedValue: Math.round((currentThresholds.suggestRelated - 0.03) * 100) / 100,
      reason: `${((tier3Count / totalQueries) * 100).toFixed(0)}% of queries are being declined. Lowering the suggest threshold would show more related questions.`,
    });
  }

  return {
    currentThresholds,
    recommendations,
    stats: {
      totalQueries,
      tier1Count,
      tier2Count,
      tier3Count,
      tier1PositiveRate,
      tier2PositiveRate,
      avgTier1Confidence,
      avgTier2Confidence,
    },
  };
}
