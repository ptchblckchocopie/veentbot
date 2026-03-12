import { describe, it, expect } from 'vitest';
import { correctTypos } from '../../src/core/security/spellcheck.js';

describe('correctTypos', () => {
  it('corrects brand name misspellings', () => {
    expect(correctTypos('what is veent tiks?')).toBe('what is veent tix?');
    expect(correctTypos('how does vent tix work')).toBe('how does veent tix work');
  });

  it('corrects payment method misspellings', () => {
    expect(correctTypos('can I pay with gcash')).toBe('can I pay with GCash');
    expect(correctTypos('does it accept g-cash')).toBe('does it accept GCash');
    expect(correctTypos('paymaya payment')).toBe('Maya payment');
  });

  it('corrects common action word typos', () => {
    expect(correctTypos('can I get a refound')).toBe('can I get a refund');
    expect(correctTypos('how to byu a tiket')).toBe('how to buy a ticket');
    expect(correctTypos('I want to purchas tickects')).toBe('I want to purchase tickets');
  });

  it('corrects navigation-related typos', () => {
    expect(correctTypos('how to sing in')).toBe('how to sign in');
    expect(correctTypos('I need to loign')).toBe('I need to login');
    expect(correctTypos('where is the hompage')).toBe('where is the homepage');
  });

  it('corrects support-related typos', () => {
    expect(correctTypos('how to contac suport')).toBe('how to contact support');
    expect(correctTypos('privcay plicy page')).toBe('privacy policy page');
  });

  it('preserves correct text unchanged', () => {
    expect(correctTypos('What is Veent Tix?')).toBe('What is Veent Tix?');
    expect(correctTypos('How do I buy tickets?')).toBe('How do I buy tickets?');
    expect(correctTypos('Can I pay with GCash?')).toBe('Can I pay with GCash?');
  });

  it('handles empty and whitespace input', () => {
    expect(correctTypos('')).toBe('');
    expect(correctTypos('   ')).toBe('   ');
  });

  it('preserves punctuation around corrected words', () => {
    expect(correctTypos('refound?')).toBe('refund?');
    expect(correctTypos('(tiket)')).toBe('(ticket)');
  });

  it('corrects Tagalog common misspellings', () => {
    expect(correctTypos('pano bumili')).toBe('paano bumili');
    expect(correctTypos('san ang events')).toBe('saan ang events');
  });
});
