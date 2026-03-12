import pg from 'pg';

export interface FlaggedFAQ {
  faqId: string;
  question: string;
  answer: string;
  negativeCount: number;
  positiveCount: number;
  totalFeedback: number;
  negativeRatio: number;
  recentComments: string[];
}

/**
 * Analyzes feedback to find FAQ entries that are performing poorly.
 * Flags entries with 3+ negative feedbacks in the given window.
 */
export async function analyzeFeedback(
  pool: pg.Pool,
  options: { sinceDays?: number; minNegative?: number } = {}
): Promise<FlaggedFAQ[]> {
  const { sinceDays = 7, minNegative = 3 } = options;

  const result = await pool.query(
    `SELECT
       f.faq_entry_id AS faq_id,
       faq.question,
       faq.answer,
       COUNT(*) FILTER (WHERE f.rating = 'negative') AS negative_count,
       COUNT(*) FILTER (WHERE f.rating = 'positive') AS positive_count,
       COUNT(*) AS total_feedback,
       ARRAY_AGG(f.comment) FILTER (WHERE f.comment IS NOT NULL AND f.rating = 'negative') AS comments
     FROM feedback f
     JOIN faq_entries faq ON faq.id = f.faq_entry_id
     WHERE f.faq_entry_id IS NOT NULL
       AND f.created_at > now() - $1 * interval '1 day'
     GROUP BY f.faq_entry_id, faq.question, faq.answer
     HAVING COUNT(*) FILTER (WHERE f.rating = 'negative') >= $2
     ORDER BY COUNT(*) FILTER (WHERE f.rating = 'negative') DESC`,
    [sinceDays, minNegative]
  );

  return result.rows.map(row => ({
    faqId: row.faq_id,
    question: row.question,
    answer: row.answer,
    negativeCount: parseInt(row.negative_count),
    positiveCount: parseInt(row.positive_count),
    totalFeedback: parseInt(row.total_feedback),
    negativeRatio: parseInt(row.negative_count) / parseInt(row.total_feedback),
    recentComments: (row.comments || []).slice(0, 10),
  }));
}
