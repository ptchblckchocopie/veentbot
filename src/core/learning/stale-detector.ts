import pg from 'pg';

export interface StaleFAQ {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  updatedAt: Date;
  daysSinceUpdate: number;
  recentHits: number; // How often it was matched recently
}

/**
 * Finds FAQ entries that haven't been updated in N days
 * but are still being actively matched by users.
 */
export async function detectStaleEntries(
  pool: pg.Pool,
  options: { staleDays?: number; minRecentHits?: number } = {}
): Promise<StaleFAQ[]> {
  const { staleDays = 90, minRecentHits = 1 } = options;

  const result = await pool.query(
    `SELECT
       faq.id,
       faq.question,
       faq.answer,
       faq.category,
       faq.updated_at,
       EXTRACT(DAY FROM now() - faq.updated_at)::int AS days_since_update,
       COUNT(cm.id) AS recent_hits
     FROM faq_entries faq
     LEFT JOIN chat_messages cm
       ON cm.faq_entry_id = faq.id
       AND cm.created_at > now() - interval '30 days'
     WHERE faq.is_active = true
       AND faq.updated_at < now() - $1 * interval '1 day'
     GROUP BY faq.id
     HAVING COUNT(cm.id) >= $2
     ORDER BY EXTRACT(DAY FROM now() - faq.updated_at) DESC`,
    [staleDays, minRecentHits]
  );

  return result.rows.map(row => ({
    id: row.id,
    question: row.question,
    answer: row.answer,
    category: row.category,
    updatedAt: row.updated_at,
    daysSinceUpdate: parseInt(row.days_since_update),
    recentHits: parseInt(row.recent_hits),
  }));
}
