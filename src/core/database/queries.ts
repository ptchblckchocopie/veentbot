import pg from 'pg';

// ============================================================
// FAQ CRUD
// ============================================================

export async function upsertFAQ(
  pool: pg.Pool,
  id: string | null,
  question: string,
  answer: string,
  category: string | null,
  embeddingCombined: number[],
  embeddingQuestion: number[],
  metadata: Record<string, unknown>,
  payloadCmsId: string | null
): Promise<string> {
  const vecCombined = `[${embeddingCombined.join(',')}]`;
  const vecQuestion = `[${embeddingQuestion.join(',')}]`;

  if (id) {
    // Update existing
    await pool.query(
      `UPDATE faq_entries
       SET question = $1, answer = $2, category = $3,
           embedding_combined = $4::vector, embedding_question = $5::vector,
           metadata = $6, payload_cms_id = $7
       WHERE id = $8`,
      [question, answer, category, vecCombined, vecQuestion, JSON.stringify(metadata), payloadCmsId, id]
    );
    return id;
  } else {
    // Insert new
    const result = await pool.query(
      `INSERT INTO faq_entries (question, answer, category, embedding_combined, embedding_question, metadata, payload_cms_id)
       VALUES ($1, $2, $3, $4::vector, $5::vector, $6, $7)
       RETURNING id`,
      [question, answer, category, vecCombined, vecQuestion, JSON.stringify(metadata), payloadCmsId]
    );
    return result.rows[0].id;
  }
}

export async function softDeleteFAQ(pool: pg.Pool, id: string): Promise<void> {
  await pool.query('UPDATE faq_entries SET is_active = false WHERE id = $1', [id]);
}

export async function getFAQById(pool: pg.Pool, id: string) {
  const result = await pool.query('SELECT * FROM faq_entries WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function getAllActiveFAQs(pool: pg.Pool) {
  const result = await pool.query(
    'SELECT id, question, answer, category, metadata FROM faq_entries WHERE is_active = true ORDER BY created_at'
  );
  return result.rows;
}

// ============================================================
// VECTOR SEARCH
// ============================================================

export async function searchByCombinedEmbedding(
  pool: pg.Pool,
  embedding: number[],
  limit: number = 10
) {
  const vec = `[${embedding.join(',')}]`;
  const result = await pool.query(
    `SELECT id, question, answer, category,
            1 - (embedding_combined <=> $1::vector) AS score
     FROM faq_entries
     WHERE is_active = true AND embedding_combined IS NOT NULL
     ORDER BY embedding_combined <=> $1::vector
     LIMIT $2`,
    [vec, limit]
  );
  return result.rows;
}

export async function searchByQuestionEmbedding(
  pool: pg.Pool,
  embedding: number[],
  limit: number = 10
) {
  const vec = `[${embedding.join(',')}]`;
  const result = await pool.query(
    `SELECT id, question, answer, category,
            1 - (embedding_question <=> $1::vector) AS score
     FROM faq_entries
     WHERE is_active = true AND embedding_question IS NOT NULL
     ORDER BY embedding_question <=> $1::vector
     LIMIT $2`,
    [vec, limit]
  );
  return result.rows;
}

export async function searchByKeyword(
  pool: pg.Pool,
  query: string,
  limit: number = 10
) {
  // Use OR-based matching so partial keyword overlap still returns results
  // plainto_tsquery uses AND which is too strict for natural language questions
  const result = await pool.query(
    `WITH terms AS (
       SELECT plainto_tsquery('english', $1) AS strict_q,
              -- Build OR query from individual words
              string_agg(lexeme::text, ' | ') AS or_terms
       FROM unnest(to_tsvector('english', $1)) AS t(lexeme, positions, weights)
     )
     SELECT id, question, answer, category,
            ts_rank(f.search_vector, to_tsquery('english', COALESCE(t.or_terms, ''))) AS score
     FROM faq_entries f, terms t
     WHERE f.is_active = true
       AND f.search_vector @@ to_tsquery('english', COALESCE(t.or_terms, ''))
     ORDER BY score DESC
     LIMIT $2`,
    [query, limit]
  );
  return result.rows;
}

// ============================================================
// KNOWLEDGE CHUNKS
// ============================================================

export async function upsertChunk(
  pool: pg.Pool,
  documentName: string,
  heading: string | null,
  content: string,
  chunkIndex: number,
  embedding: number[],
  metadata: Record<string, unknown> = {}
): Promise<string> {
  const vec = `[${embedding.join(',')}]`;
  const result = await pool.query(
    `INSERT INTO knowledge_chunks (document_name, heading, content, chunk_index, embedding, metadata)
     VALUES ($1, $2, $3, $4, $5::vector, $6)
     RETURNING id`,
    [documentName, heading, content, chunkIndex, vec, JSON.stringify(metadata)]
  );
  return result.rows[0].id;
}

export async function deleteChunksByDocument(pool: pg.Pool, documentName: string): Promise<number> {
  const result = await pool.query(
    'DELETE FROM knowledge_chunks WHERE document_name = $1',
    [documentName]
  );
  return result.rowCount ?? 0;
}

export async function searchChunksByEmbedding(
  pool: pg.Pool,
  embedding: number[],
  limit: number = 5
) {
  const vec = `[${embedding.join(',')}]`;
  const result = await pool.query(
    `SELECT id, document_name, heading, content,
            1 - (embedding <=> $1::vector) AS score
     FROM knowledge_chunks
     WHERE is_active = true AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [vec, limit]
  );
  return result.rows;
}

export async function searchChunksByKeyword(
  pool: pg.Pool,
  query: string,
  limit: number = 5
) {
  const result = await pool.query(
    `WITH terms AS (
       SELECT string_agg(lexeme::text, ' | ') AS or_terms
       FROM unnest(to_tsvector('english', $1)) AS t(lexeme, positions, weights)
     )
     SELECT c.id, c.document_name, c.heading, c.content,
            ts_rank(c.search_vector, to_tsquery('english', COALESCE(t.or_terms, ''))) AS score
     FROM knowledge_chunks c, terms t
     WHERE c.is_active = true
       AND c.search_vector @@ to_tsquery('english', COALESCE(t.or_terms, ''))
     ORDER BY score DESC
     LIMIT $2`,
    [query, limit]
  );
  return result.rows;
}

export async function getAllDocuments(pool: pg.Pool) {
  const result = await pool.query(
    `SELECT document_name, COUNT(*) as chunk_count, MIN(created_at) as created_at
     FROM knowledge_chunks WHERE is_active = true
     GROUP BY document_name ORDER BY document_name`
  );
  return result.rows;
}

// ============================================================
// SEMANTIC CACHE
// ============================================================

export async function findCachedResponse(
  pool: pg.Pool,
  queryEmbedding: number[],
  similarityThreshold: number
) {
  const vec = `[${queryEmbedding.join(',')}]`;
  const result = await pool.query(
    `SELECT id, response_text, faq_entry_ids,
            1 - (query_embedding <=> $1::vector) AS score
     FROM semantic_cache
     WHERE expires_at > now()
       AND 1 - (query_embedding <=> $1::vector) >= $2
     ORDER BY query_embedding <=> $1::vector
     LIMIT 1`,
    [vec, similarityThreshold]
  );

  if (result.rows.length > 0) {
    // Increment hit count
    await pool.query(
      'UPDATE semantic_cache SET hit_count = hit_count + 1 WHERE id = $1',
      [result.rows[0].id]
    );
    return result.rows[0];
  }
  return null;
}

export async function cacheResponse(
  pool: pg.Pool,
  queryEmbedding: number[],
  queryText: string,
  responseText: string,
  faqEntryIds: string[],
  ttlSeconds: number
) {
  const vec = `[${queryEmbedding.join(',')}]`;
  await pool.query(
    `INSERT INTO semantic_cache (query_embedding, query_text, response_text, faq_entry_ids, expires_at)
     VALUES ($1::vector, $2, $3, $4, now() + $5 * interval '1 second')`,
    [vec, queryText, responseText, faqEntryIds, ttlSeconds]
  );
}

export async function invalidateCacheForFAQs(pool: pg.Pool, faqIds: string[]): Promise<void> {
  await pool.query(
    'DELETE FROM semantic_cache WHERE faq_entry_ids && $1',
    [faqIds]
  );
}

export async function cleanExpiredCache(pool: pg.Pool): Promise<number> {
  const result = await pool.query('DELETE FROM semantic_cache WHERE expires_at < now()');
  return result.rowCount ?? 0;
}

// ============================================================
// SESSIONS & MESSAGES
// ============================================================

export async function createSession(pool: pg.Pool, metadata: Record<string, unknown> = {}) {
  const result = await pool.query(
    'INSERT INTO chat_sessions (metadata) VALUES ($1) RETURNING id',
    [JSON.stringify(metadata)]
  );
  return result.rows[0].id as string;
}

export async function logMessage(
  pool: pg.Pool,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  faqEntryId: string | null,
  similarityScore: number | null,
  tier: string | null,
  llmModel: string | null,
  tokensUsed: number
) {
  const result = await pool.query(
    `INSERT INTO chat_messages (session_id, role, content, faq_entry_id, similarity_score, tier, llm_model, tokens_used)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [sessionId, role, content, faqEntryId, similarityScore, tier, llmModel, tokensUsed]
  );
  return result.rows[0].id as string;
}

export async function getSessionMessages(pool: pg.Pool, sessionId: string) {
  const result = await pool.query(
    `SELECT id, role, content, faq_entry_id, similarity_score, tier, created_at
     FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId]
  );
  return result.rows;
}

// ============================================================
// FEEDBACK
// ============================================================

export async function saveFeedback(
  pool: pg.Pool,
  messageId: string,
  sessionId: string,
  rating: 'positive' | 'negative',
  comment: string | null,
  faqEntryId: string | null,
  tier: string | null
) {
  await pool.query(
    `INSERT INTO feedback (message_id, session_id, rating, comment, faq_entry_id, tier)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [messageId, sessionId, rating, comment, faqEntryId, tier]
  );
}
