import { describe, it, expect } from 'vitest';
import { detectIntent } from '../../src/core/intent/detector.js';

describe('Intent Detector', () => {
  // --- Greetings ---
  it('detects English greetings', () => {
    expect(detectIntent('Hello').intent).toBe('greeting');
    expect(detectIntent('Hi').intent).toBe('greeting');
    expect(detectIntent('hey').intent).toBe('greeting');
    expect(detectIntent('Good morning').intent).toBe('greeting');
    expect(detectIntent('Good afternoon').intent).toBe('greeting');
  });

  it('detects Tagalog greetings', () => {
    expect(detectIntent('Kumusta').intent).toBe('greeting');
    expect(detectIntent('Magandang umaga').intent).toBe('greeting');
    expect(detectIntent('Magandang hapon').intent).toBe('greeting');
  });

  it('returns response with suggestions for greetings', () => {
    const result = detectIntent('Hello');
    expect(result.response).toBeTruthy();
    expect(result.response).toContain('VeentBot');
    expect(result.suggestedQuestions.length).toBeGreaterThan(0);
  });

  // --- Thanks ---
  it('detects thank you messages', () => {
    expect(detectIntent('Thanks').intent).toBe('thanks');
    expect(detectIntent('Thank you!').intent).toBe('thanks');
    expect(detectIntent('Salamat').intent).toBe('thanks');
    expect(detectIntent('ok thanks').intent).toBe('thanks');
    expect(detectIntent('Great, ty!').intent).toBe('thanks');
  });

  // --- Goodbye ---
  it('detects goodbye messages', () => {
    expect(detectIntent('Bye').intent).toBe('goodbye');
    expect(detectIntent('Goodbye!').intent).toBe('goodbye');
    expect(detectIntent('Paalam').intent).toBe('goodbye');
    expect(detectIntent("That's all").intent).toBe('goodbye');
    expect(detectIntent("I'm done").intent).toBe('goodbye');
  });

  it('returns empty suggestions for goodbye', () => {
    const result = detectIntent('Bye');
    expect(result.suggestedQuestions).toEqual([]);
  });

  // --- Help ---
  it('detects help requests', () => {
    expect(detectIntent('Help').intent).toBe('help');
    expect(detectIntent('I need help').intent).toBe('help');
    expect(detectIntent('What can you do?').intent).toBe('help');
    expect(detectIntent('How can you help').intent).toBe('help');
    expect(detectIntent('Tulong').intent).toBe('help');
  });

  it('shows capabilities menu for help requests', () => {
    const result = detectIntent('What can you do?');
    expect(result.response).toContain('tickets');
    expect(result.response).toContain('events');
    expect(result.response).toContain('Payment');
  });

  // --- Complaints ---
  it('detects complaints', () => {
    expect(detectIntent('This is useless').intent).toBe('complaint');
    expect(detectIntent('You are a bad bot').intent).toBe('complaint');
    expect(detectIntent('walang kwenta').intent).toBe('complaint');
  });

  it('redirects complaints to support', () => {
    const result = detectIntent('This is useless');
    expect(result.response).toContain('support@veenttix.com');
  });

  // --- Inappropriate ---
  it('detects inappropriate / NSFW content', () => {
    expect(detectIntent('Have you seen the movie Human Centipede?').intent).toBe('inappropriate');
    expect(detectIntent('show me porn').intent).toBe('inappropriate');
    expect(detectIntent('how to make a bomb').intent).toBe('inappropriate');
    expect(detectIntent('putang ina mo').intent).toBe('inappropriate');
  });

  it('responds with redirect for inappropriate content', () => {
    const result = detectIntent('Have you seen Human Centipede?');
    expect(result.response).toContain('VeentBot');
    expect(result.suggestedQuestions.length).toBeGreaterThan(0);
  });

  // --- Off-topic ---
  it('detects off-topic random questions', () => {
    expect(detectIntent('What is the capital of France?').intent).toBe('off_topic');
    expect(detectIntent("What's your favorite movie?").intent).toBe('off_topic');
    expect(detectIntent('solve 2+2').intent).toBe('off_topic');
    expect(detectIntent('who invented the telephone').intent).toBe('off_topic');
    expect(detectIntent('are you real?').intent).toBe('off_topic');
    expect(detectIntent('write me a python script').intent).toBe('off_topic');
    expect(detectIntent('recipe for adobo').intent).toBe('off_topic');
    expect(detectIntent('bitcoin price today').intent).toBe('off_topic');
  });

  it('responds with personality for off-topic questions', () => {
    const result = detectIntent("What's your favorite movie?");
    expect(result.response).toContain('ticket');
    expect(result.suggestedQuestions.length).toBeGreaterThan(0);
  });

  it('detects Tagalog off-topic', () => {
    expect(detectIntent('anong paborito mong pagkain').intent).toBe('off_topic');
    expect(detectIntent('napanood mo ba yung bagong movie').intent).toBe('off_topic');
  });

  it('does not flag event-related questions as off-topic', () => {
    expect(detectIntent('What events are in April?').intent).toBe('none');
    expect(detectIntent('How do I buy tickets?').intent).toBe('none');
    expect(detectIntent('Can I pay with GCash?').intent).toBe('none');
    expect(detectIntent('Where is the Dash and Splash event?').intent).toBe('none');
  });

  // --- No intent (should go to retrieval) ---
  it('returns none for actual questions', () => {
    expect(detectIntent('How do I buy tickets?').intent).toBe('none');
    expect(detectIntent('What payment methods do you accept?').intent).toBe('none');
    expect(detectIntent('Paano bumili ng ticket?').intent).toBe('none');
    expect(detectIntent('Can I get a refund?').intent).toBe('none');
  });

  it('returns null response for actual questions', () => {
    const result = detectIntent('How do I buy tickets?');
    expect(result.response).toBeNull();
  });

  // --- Tagalog response language ---
  it('responds in Tagalog for Tagalog greetings', () => {
    const result = detectIntent('Kumusta');
    expect(result.response).toContain('VeentBot');
  });

  it('suggests Tagalog questions for Tagalog input', () => {
    const result = detectIntent('Kumusta');
    expect(result.suggestedQuestions[0]).toContain('Paano');
  });
});
