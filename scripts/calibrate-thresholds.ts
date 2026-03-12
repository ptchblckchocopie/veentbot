import { createFAQBot } from '../src/core/index.js';
import { closeDatabase, getPool } from '../src/core/database/index.js';
import { OllamaEmbeddingService } from '../src/core/embedding/ollama.js';
import { searchByCombinedEmbedding, searchByQuestionEmbedding } from '../src/core/database/queries.js';
import 'dotenv/config';

async function main() {
  const pool = getPool(process.env.DATABASE_URL!);
  const embedder = new OllamaEmbeddingService(process.env.OLLAMA_BASE_URL || 'http://localhost:11434');

  // Test pairs: [user_query, should_match_question, expected_tier]
  const testPairs: [string, string, string][] = [
    // Exact paraphrases — should be Tier 1
    ['What does your company do?', 'What does your company do?', 'exact'],
    ['What do you guys do?', 'What does your company do?', 'exact'],
    ['What are your hours?', 'What are your business hours?', 'exact'],
    ['When are you open?', 'What are your business hours?', 'exact'],
    ['Where is your office?', 'Where are you located?', 'exact'],
    ['How do I reach support?', 'How can I contact support?', 'exact'],
    ['What tech stack do you use?', 'What technologies do you use?', 'exact'],
    ['Can I get a refund?', 'What is your refund policy?', 'exact'],
    ['How do you accept payment?', 'What payment methods do you accept?', 'exact'],

    // Related but different — should be Tier 2
    ['Do you accept GCash?', 'What payment methods do you accept?', 'rag'],
    ['How long to build an app?', 'How long does a typical project take?', 'rag'],
    ['Do you fix bugs after launching?', 'Do you offer maintenance and support after launch?', 'rag'],

    // Off-topic — should be Tier 3
    ['What is the weather today?', '', 'decline'],
    ['Tell me a joke', '', 'decline'],
    ['How do I cook pasta?', '', 'decline'],
  ];

  console.log('=== THRESHOLD CALIBRATION ===\n');
  console.log('Query | Best Combined Score | Best Question Score | Expected Tier\n');

  for (const [query, expectedMatch, expectedTier] of testPairs) {
    const embedding = await embedder.embed(query);
    const combined = await searchByCombinedEmbedding(pool, embedding, 3);
    const question = await searchByQuestionEmbedding(pool, embedding, 3);

    const bestCombined = combined[0] ? parseFloat(combined[0].score) : 0;
    const bestQuestion = question[0] ? parseFloat(question[0].score) : 0;
    const bestScore = Math.max(bestCombined, bestQuestion);
    const matchedQ = combined[0]?.question || '(none)';

    console.log(`"${query}"`);
    console.log(`  Combined: ${bestCombined.toFixed(4)} | Question: ${bestQuestion.toFixed(4)} | Best: ${bestScore.toFixed(4)} | Expected: ${expectedTier}`);
    console.log(`  Matched: "${matchedQ.substring(0, 60)}"`);
    console.log();
  }

  await closeDatabase();
}

main().catch(err => { console.error(err); process.exit(1); });
