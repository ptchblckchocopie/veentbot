import pg from 'pg';
import { GeminiEmbeddingService } from '../src/core/embedding/gemini.js';
import 'dotenv/config';

async function main() {
  const query = process.argv[2] || 'What events are happening in April?';
  const url = process.env.DATABASE_URL!.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');
  const pool = new pg.Pool({
    connectionString: url,
    ssl: url.includes('ondigitalocean.com') ? { rejectUnauthorized: false } : undefined,
  });

  const emb = new GeminiEmbeddingService(process.env.GEMINI_API_KEY!);
  const embedding = await emb.embed(query);
  const vec = `[${embedding.join(',')}]`;

  console.log(`\nQuery: "${query}"\n`);

  // FAQ combined vector search
  const faqCombined = await pool.query(
    `SELECT id, question, 1 - (embedding_combined <=> $1::vector) AS score
     FROM faq_entries WHERE is_active = true AND embedding_combined IS NOT NULL
     ORDER BY embedding_combined <=> $1::vector LIMIT 5`, [vec]);
  console.log('=== FAQ Combined Vector ===');
  faqCombined.rows.forEach((r, i) => console.log(`  ${i+1}. [${Number(r.score).toFixed(3)}] ${r.question}`));

  // FAQ keyword search
  const faqKeyword = await pool.query(
    `SELECT id, question, ts_rank(search_vector, plainto_tsquery('english', $1)) AS score
     FROM faq_entries WHERE is_active = true AND search_vector @@ plainto_tsquery('english', $1)
     ORDER BY score DESC LIMIT 5`, [query]);
  console.log('\n=== FAQ Keyword ===');
  faqKeyword.rows.forEach((r, i) => console.log(`  ${i+1}. [${Number(r.score).toFixed(3)}] ${r.question}`));

  // Chunk vector search
  const chunkVector = await pool.query(
    `SELECT id, document_name, heading, 1 - (embedding <=> $1::vector) AS score
     FROM knowledge_chunks WHERE is_active = true AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector LIMIT 5`, [vec]);
  console.log('\n=== Chunk Vector ===');
  chunkVector.rows.forEach((r, i) => console.log(`  ${i+1}. [${Number(r.score).toFixed(3)}] ${r.document_name}: ${r.heading}`));

  // Chunk keyword search
  const chunkKeyword = await pool.query(
    `SELECT id, document_name, heading, ts_rank(search_vector, plainto_tsquery('english', $1)) AS score
     FROM knowledge_chunks WHERE is_active = true AND search_vector @@ plainto_tsquery('english', $1)
     ORDER BY score DESC LIMIT 5`, [query]);
  console.log('\n=== Chunk Keyword ===');
  chunkKeyword.rows.forEach((r, i) => console.log(`  ${i+1}. [${Number(r.score).toFixed(3)}] ${r.document_name}: ${r.heading}`));

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
