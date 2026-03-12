import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserMessage, buildDeclineMessage } from '../../src/core/llm/prompts.js';
import type { RetrievalResult } from '../../src/core/types.js';

describe('Prompt Builder', () => {
  it('includes company name and VeentBot identity in system prompt', () => {
    const prompt = buildSystemPrompt('Veent');
    expect(prompt).toContain('VeentBot');
    expect(prompt).toContain('Veent');
    expect(prompt).toContain('ONLY');
    expect(prompt).toContain('NEVER fabricate');
  });

  it('builds user message with FAQ context', () => {
    const context: RetrievalResult[] = [
      { faqId: '1', question: 'What are your hours?', answer: '9-5 EST', category: 'general', combinedScore: 0.9, questionScore: 0.9, keywordScore: 0, rrfScore: 0 },
      { faqId: '2', question: 'Where are you?', answer: 'Manila', category: 'general', combinedScore: 0.8, questionScore: 0.8, keywordScore: 0, rrfScore: 0 },
    ];

    const message = buildUserMessage('When do you open?', context);

    expect(message).toContain('FAQ 1:');
    expect(message).toContain('FAQ 2:');
    expect(message).toContain('9-5 EST');
    expect(message).toContain('Manila');
    expect(message).toContain('When do you open?');
    expect(message).toContain('Answer naturally');
  });

  it('builds decline message with suggestions', () => {
    const message = buildDeclineMessage(['How do I pay?', 'What are your hours?']);
    expect(message).toContain('How do I pay?');
    expect(message).toContain('What are your hours?');
  });

  it('builds decline message without suggestions', () => {
    const message = buildDeclineMessage([]);
    expect(message).toContain("blind spot");
    expect(message).toContain("support@veenttix.com");
  });
});
