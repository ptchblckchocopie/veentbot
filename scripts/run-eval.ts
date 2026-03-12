import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createFAQBot } from '../src/core/index.js';
import { closeDatabase } from '../src/core/database/index.js';
import 'dotenv/config';

interface TestCase {
  query: string;
  expected_tier: string;
  expected_faq_contains: string | null;
  category: string;
}

interface TestResult extends TestCase {
  actual_tier: string;
  actual_answer: string;
  confidence: number;
  cached: boolean;
  tier_pass: boolean;
  content_pass: boolean;
  pass: boolean;
  duration_ms: number;
}

async function main() {
  const evalPath = join(import.meta.dirname, '..', 'eval', 'test-cases.json');
  const data = JSON.parse(readFileSync(evalPath, 'utf-8'));
  const cases: TestCase[] = data.cases;

  const bot = await createFAQBot({
    database: { connectionString: process.env.DATABASE_URL! },
    companyName: process.env.COMPANY_NAME || 'Veent',
    embedding: { provider: 'ollama', baseUrl: process.env.OLLAMA_BASE_URL },
    llm: { provider: 'gemini', apiKey: process.env.GEMINI_API_KEY },
  });

  console.log(`=== VEENT BOT EVALUATION ===`);
  console.log(`Running ${cases.length} test cases...\n`);

  const results: TestResult[] = [];
  const categoryStats: Record<string, { pass: number; fail: number }> = {};

  for (const tc of cases) {
    const start = Date.now();
    const res = await bot.query(tc.query);
    const duration = Date.now() - start;

    // Check tier
    let tierPass = false;
    if (tc.expected_tier === 'exact_or_rag') {
      tierPass = res.tier === 'exact' || res.tier === 'rag';
    } else {
      tierPass = res.tier === tc.expected_tier;
    }

    // Check content
    let contentPass = true;
    if (tc.expected_faq_contains) {
      contentPass = res.answer.toLowerCase().includes(tc.expected_faq_contains.toLowerCase());
    }

    const pass = tierPass && contentPass;

    const result: TestResult = {
      ...tc,
      actual_tier: res.tier,
      actual_answer: res.answer.substring(0, 100),
      confidence: res.confidence,
      cached: res.cached,
      tier_pass: tierPass,
      content_pass: contentPass,
      pass,
      duration_ms: duration,
    };
    results.push(result);

    // Track per-category stats
    if (!categoryStats[tc.category]) categoryStats[tc.category] = { pass: 0, fail: 0 };
    if (pass) categoryStats[tc.category].pass++;
    else categoryStats[tc.category].fail++;

    const icon = pass ? 'PASS' : 'FAIL';
    const display = tc.query.length > 50 ? tc.query.substring(0, 50) + '...' : tc.query || '(empty)';
    if (!pass) {
      console.log(`  ${icon} | "${display}" | expected: ${tc.expected_tier} got: ${res.tier} | ${duration}ms`);
    }
  }

  // Summary
  const totalPass = results.filter(r => r.pass).length;
  const totalFail = results.filter(r => !r.pass).length;
  const accuracy = ((totalPass / results.length) * 100).toFixed(1);

  console.log(`\n=== RESULTS ===`);
  console.log(`Total: ${results.length} | Pass: ${totalPass} | Fail: ${totalFail} | Accuracy: ${accuracy}%\n`);

  console.log('Per category:');
  for (const [cat, stats] of Object.entries(categoryStats)) {
    const total = stats.pass + stats.fail;
    const pct = ((stats.pass / total) * 100).toFixed(0);
    console.log(`  ${cat.padEnd(16)} ${stats.pass}/${total} (${pct}%)`);
  }

  // Metrics
  const tierAccuracy = results.filter(r => r.tier_pass).length / results.length;
  const contentAccuracy = results.filter(r => r.content_pass).length / results.length;
  const avgDuration = results.reduce((sum, r) => sum + r.duration_ms, 0) / results.length;
  const declineResults = results.filter(r => r.category === 'off_topic' || r.category === 'adversarial' || r.category === 'edge_case');
  const correctDeclines = declineResults.filter(r => r.actual_tier === 'decline').length;

  console.log(`\nMetrics:`);
  console.log(`  Tier accuracy:        ${(tierAccuracy * 100).toFixed(1)}%`);
  console.log(`  Content accuracy:     ${(contentAccuracy * 100).toFixed(1)}%`);
  console.log(`  Decline accuracy:     ${correctDeclines}/${declineResults.length} (${((correctDeclines / declineResults.length) * 100).toFixed(0)}%)`);
  console.log(`  Avg response time:    ${avgDuration.toFixed(0)}ms`);

  // Save results
  mkdirSync(join(import.meta.dirname, '..', 'eval', 'results'), { recursive: true });
  const resultPath = join(import.meta.dirname, '..', 'eval', 'results', `eval-${Date.now()}.json`);
  writeFileSync(resultPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalCases: results.length,
    passed: totalPass,
    failed: totalFail,
    accuracy: parseFloat(accuracy),
    tierAccuracy: parseFloat((tierAccuracy * 100).toFixed(1)),
    contentAccuracy: parseFloat((contentAccuracy * 100).toFixed(1)),
    avgDurationMs: parseFloat(avgDuration.toFixed(0)),
    categoryStats,
    results,
  }, null, 2));

  console.log(`\nResults saved to: ${resultPath}`);

  await closeDatabase();
  process.exit(totalFail > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
