import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../../src/core/security/rate-limiter.js';

describe('Rate Limiter', () => {
  it('allows requests under the limit', () => {
    const limiter = new RateLimiter({ perIp: { maxRequests: 5, windowMs: 1000 } });

    for (let i = 0; i < 5; i++) {
      expect(limiter.check('1.2.3.4').allowed).toBe(true);
    }
  });

  it('blocks requests over the IP limit', () => {
    const limiter = new RateLimiter({ perIp: { maxRequests: 3, windowMs: 60_000 } });

    expect(limiter.check('1.2.3.4').allowed).toBe(true);
    expect(limiter.check('1.2.3.4').allowed).toBe(true);
    expect(limiter.check('1.2.3.4').allowed).toBe(true);

    const result = limiter.check('1.2.3.4');
    expect(result.allowed).toBe(false);
    expect(result.limitType).toBe('ip');
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('tracks IPs independently', () => {
    const limiter = new RateLimiter({ perIp: { maxRequests: 2, windowMs: 60_000 } });

    expect(limiter.check('1.1.1.1').allowed).toBe(true);
    expect(limiter.check('1.1.1.1').allowed).toBe(true);
    expect(limiter.check('1.1.1.1').allowed).toBe(false);

    // Different IP should still work
    expect(limiter.check('2.2.2.2').allowed).toBe(true);
  });

  it('blocks requests over the session limit', () => {
    const limiter = new RateLimiter({
      perIp: { maxRequests: 100, windowMs: 60_000 },
      perSession: { maxRequests: 2, windowMs: 60_000 },
    });

    expect(limiter.check('1.1.1.1', 'sess-1').allowed).toBe(true);
    expect(limiter.check('1.1.1.1', 'sess-1').allowed).toBe(true);

    const result = limiter.check('1.1.1.1', 'sess-1');
    expect(result.allowed).toBe(false);
    expect(result.limitType).toBe('session');
  });

  it('blocks requests over the global limit', () => {
    const limiter = new RateLimiter({
      perIp: { maxRequests: 100, windowMs: 60_000 },
      global: { maxRequests: 3, windowMs: 60_000 },
    });

    expect(limiter.check('1.1.1.1').allowed).toBe(true);
    expect(limiter.check('2.2.2.2').allowed).toBe(true);
    expect(limiter.check('3.3.3.3').allowed).toBe(true);

    const result = limiter.check('4.4.4.4');
    expect(result.allowed).toBe(false);
    expect(result.limitType).toBe('global');
  });

  it('provides retryAfterMs on rejection', () => {
    const limiter = new RateLimiter({ perIp: { maxRequests: 1, windowMs: 5000 } });

    limiter.check('1.1.1.1');
    const result = limiter.check('1.1.1.1');

    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThanOrEqual(1000);
    expect(result.retryAfterMs).toBeLessThanOrEqual(5000);
  });
});
