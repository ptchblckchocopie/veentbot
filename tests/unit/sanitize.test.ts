import { describe, it, expect } from 'vitest';
import { sanitizeInput } from '../../src/core/security/sanitize.js';

describe('Input Sanitization', () => {
  it('passes clean input through', () => {
    const result = sanitizeInput('What are your hours?');
    expect(result.rejected).toBe(false);
    expect(result.text).toBe('What are your hours?');
  });

  it('strips HTML tags', () => {
    const result = sanitizeInput('Hello <script>alert("xss")</script> world');
    expect(result.rejected).toBe(false);
    expect(result.text).toBe('Hello alert("xss") world');
  });

  it('strips control characters', () => {
    const result = sanitizeInput('Hello\x00\x01\x02 world');
    expect(result.rejected).toBe(false);
    expect(result.text).toBe('Hello world');
  });

  it('collapses multiple spaces', () => {
    const result = sanitizeInput('Hello     world');
    expect(result.rejected).toBe(false);
    expect(result.text).toBe('Hello world');
  });

  it('rejects empty input', () => {
    expect(sanitizeInput('').rejected).toBe(true);
    expect(sanitizeInput('   ').rejected).toBe(true);
  });

  it('rejects null/undefined', () => {
    expect(sanitizeInput(null as unknown as string).rejected).toBe(true);
    expect(sanitizeInput(undefined as unknown as string).rejected).toBe(true);
  });

  it('rejects input over 500 characters', () => {
    const long = 'a'.repeat(501);
    const result = sanitizeInput(long);
    expect(result.rejected).toBe(true);
    expect(result.reason).toContain('500');
  });

  it('accepts input at exactly 500 characters', () => {
    const exact = 'a'.repeat(500);
    const result = sanitizeInput(exact);
    expect(result.rejected).toBe(false);
  });

  it('rejects input that becomes empty after stripping HTML', () => {
    const result = sanitizeInput('<div></div>');
    expect(result.rejected).toBe(true);
  });
});
