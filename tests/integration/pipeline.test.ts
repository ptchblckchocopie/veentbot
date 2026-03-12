import { describe, it, expect, afterAll } from 'vitest';
import { getTestBot, cleanup } from './setup.js';

afterAll(async () => { await cleanup(); });

describe('Query Pipeline (integration)', () => {
  it('returns exact match for close paraphrase', async () => {
    const bot = await getTestBot();
    const res = await bot.query('Do you accept GCash?');

    expect(res.tier).toBe('exact');
    expect(res.confidence).toBeGreaterThan(0.78);
    expect(res.answer.toLowerCase()).toContain('gcash');
    expect(res.cached).toBe(false);
  });

  it('returns rag tier for moderate match', async () => {
    const bot = await getTestBot();
    const res = await bot.query('Can I get my money back?');

    // Without Gemini key, rag falls back to top answer
    expect(['rag', 'exact']).toContain(res.tier);
    expect(res.confidence).toBeGreaterThan(0.52);
    expect(res.answer.toLowerCase()).toContain('refund');
  });

  it('catches off-topic questions via intent detector', async () => {
    const bot = await getTestBot();
    const res = await bot.query('What is the meaning of life?');

    // Off-topic intent detector catches this before retrieval
    expect(res.tier).toBe('exact');
    expect(res.confidence).toBe(1);
    expect(res.answer).toContain('ticket');
  });

  it('returns session ID for every query', async () => {
    const bot = await getTestBot();
    const res = await bot.query('Where are you located?');

    expect(res.sessionId).toBeTruthy();
    expect(typeof res.sessionId).toBe('string');
  });

  it('preserves session across queries', async () => {
    const bot = await getTestBot();
    const res1 = await bot.query('Do you accept GCash payments?');
    const res2 = await bot.query('What about Maya?', res1.sessionId);

    expect(res2.sessionId).toBe(res1.sessionId);

    const history = await bot.getSession(res1.sessionId);
    // 2 user messages + 2 assistant messages = 4
    expect(history.length).toBe(4);
  });

  it('health check passes', async () => {
    const bot = await getTestBot();
    const health = await bot.healthCheck();

    expect(health.database).toBe(true);
    expect(health.embedding).toBe(true);
  });
});

describe('FAQ Management (integration)', () => {
  it('can upsert and retrieve a new FAQ', async () => {
    const bot = await getTestBot();
    const id = await bot.upsertFAQ({
      question: 'What is the test question?',
      answer: 'This is a test answer for integration testing.',
      category: 'test',
    });

    expect(id).toBeTruthy();

    // Query for it
    const res = await bot.query('What is the test question?');
    expect(res.answer).toContain('test answer');

    // Clean up
    await bot.deleteFAQ(id);
  });

  it('can list all active FAQs', async () => {
    const bot = await getTestBot();
    const faqs = await bot.getAllFAQs();

    expect(faqs.length).toBeGreaterThanOrEqual(10); // Our seeded FAQs
    expect(faqs[0]).toHaveProperty('question');
    expect(faqs[0]).toHaveProperty('answer');
  });
});
