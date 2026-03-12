import { createFAQBot } from '../src/core/index.js';
import { closeDatabase, getPool } from '../src/core/database/index.js';
import {
  searchByCombinedEmbedding, searchByQuestionEmbedding, searchByKeyword,
  searchChunksByEmbedding, searchChunksByKeyword,
} from '../src/core/database/queries.js';
import { retrieve } from '../src/core/retrieval/index.js';
import { OllamaEmbeddingService } from '../src/core/embedding/ollama.js';
import 'dotenv/config';

async function main() {
  const bot = await createFAQBot({
    database: { connectionString: process.env.DATABASE_URL! },
    companyName: process.env.COMPANY_NAME || 'Veent',
    embedding: { provider: 'ollama', baseUrl: process.env.OLLAMA_BASE_URL },
    llm: { provider: 'gemini', apiKey: process.env.GEMINI_API_KEY },
  });

  const query = "Give me the list of all events in april";
  const embeddingService = new OllamaEmbeddingService(process.env.OLLAMA_BASE_URL || 'http://localhost:11434');
  const pool = getPool();

  // Run the full retrieval pipeline (same as bot.ts uses)
  const { tierDecision, results } = await retrieve(pool, embeddingService, query, {
    thresholds: { exactMatch: 0.75, ragGenerate: 0.55, suggestRelated: 0.35 },
    topK: 10,
  });

  console.log('=== Retrieval Pipeline Results (what the LLM sees) ===');
  console.log(`Tier: ${tierDecision.tier} | Confidence: ${tierDecision.confidence.toFixed(4)}`);
  console.log(`Context results: ${tierDecision.contextResults.length}\n`);

  for (const r of tierDecision.contextResults) {
    const type = r.category?.startsWith('doc:') ? 'CHUNK' : 'FAQ';
    console.log(`  [${type}] score=${r.combinedScore.toFixed(4)} rrf=${r.rrfScore.toFixed(4)} | ${r.question.substring(0, 70)}`);
    console.log(`         answer: ${r.answer.substring(0, 120)}...\n`);
  }

  console.log('=== All merged results ===');
  for (const r of results.slice(0, 15)) {
    const type = r.category?.startsWith('doc:') ? 'CHUNK' : 'FAQ';
    console.log(`  [${type}] score=${r.combinedScore.toFixed(4)} rrf=${r.rrfScore.toFixed(4)} | ${r.question.substring(0, 70)}`);
  }

  // Now run the full bot pipeline
  console.log('\n=== Full Bot Pipeline ===');
  const res = await bot.query(query);
  console.log(`Tier: ${res.tier} | Confidence: ${res.confidence.toFixed(4)}`);
  console.log(`Answer (first 500): ${res.answer.substring(0, 500)}`);

  await closeDatabase();
}

main().catch(e => { console.error(e); process.exit(1); });
