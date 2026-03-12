/**
 * Sliding window rate limiter.
 *
 * Tracks request timestamps in memory. For single-instance deployments this is
 * sufficient. For multi-instance, swap to a PostgreSQL or Redis backed store.
 */

export interface RateLimitConfig {
  perIp: { maxRequests: number; windowMs: number };      // e.g., 30 per 60s
  perSession: { maxRequests: number; windowMs: number };  // e.g., 20 per 60s
  global: { maxRequests: number; windowMs: number };      // e.g., 1000 per 60s
}

export interface RateLimitResult {
  allowed: boolean;
  limitType?: 'ip' | 'session' | 'global';
  retryAfterMs?: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  perIp: { maxRequests: 30, windowMs: 60_000 },
  perSession: { maxRequests: 20, windowMs: 60_000 },
  global: { maxRequests: 1000, windowMs: 60_000 },
};

export class RateLimiter {
  private ipBuckets = new Map<string, number[]>();
  private sessionBuckets = new Map<string, number[]>();
  private globalBucket: number[] = [];
  private config: RateLimitConfig;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      perIp: { ...DEFAULT_CONFIG.perIp, ...config.perIp },
      perSession: { ...DEFAULT_CONFIG.perSession, ...config.perSession },
      global: { ...DEFAULT_CONFIG.global, ...config.global },
    };

    // Clean up old entries every 60 seconds
    setInterval(() => this.cleanup(), 60_000).unref();
  }

  check(ip: string, sessionId?: string): RateLimitResult {
    const now = Date.now();

    // Global limit
    const globalResult = this.checkBucket(this.globalBucket, now, this.config.global);
    if (!globalResult.allowed) {
      return { allowed: false, limitType: 'global', retryAfterMs: globalResult.retryAfterMs };
    }

    // Per-IP limit
    if (!this.ipBuckets.has(ip)) this.ipBuckets.set(ip, []);
    const ipResult = this.checkBucket(this.ipBuckets.get(ip)!, now, this.config.perIp);
    if (!ipResult.allowed) {
      return { allowed: false, limitType: 'ip', retryAfterMs: ipResult.retryAfterMs };
    }

    // Per-session limit
    if (sessionId) {
      if (!this.sessionBuckets.has(sessionId)) this.sessionBuckets.set(sessionId, []);
      const sessionResult = this.checkBucket(this.sessionBuckets.get(sessionId)!, now, this.config.perSession);
      if (!sessionResult.allowed) {
        return { allowed: false, limitType: 'session', retryAfterMs: sessionResult.retryAfterMs };
      }
    }

    // All checks passed — record this request
    this.globalBucket.push(now);
    this.ipBuckets.get(ip)!.push(now);
    if (sessionId) this.sessionBuckets.get(sessionId)!.push(now);

    return { allowed: true };
  }

  private checkBucket(
    bucket: number[],
    now: number,
    limit: { maxRequests: number; windowMs: number }
  ): { allowed: boolean; retryAfterMs?: number } {
    // Remove expired entries
    const cutoff = now - limit.windowMs;
    while (bucket.length > 0 && bucket[0] <= cutoff) {
      bucket.shift();
    }

    if (bucket.length >= limit.maxRequests) {
      const oldestInWindow = bucket[0];
      const retryAfterMs = oldestInWindow + limit.windowMs - now;
      return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
    }

    return { allowed: true };
  }

  private cleanup() {
    const now = Date.now();
    const maxWindow = Math.max(
      this.config.perIp.windowMs,
      this.config.perSession.windowMs,
      this.config.global.windowMs
    );
    const cutoff = now - maxWindow;

    for (const [key, bucket] of this.ipBuckets) {
      const filtered = bucket.filter(t => t > cutoff);
      if (filtered.length === 0) this.ipBuckets.delete(key);
      else this.ipBuckets.set(key, filtered);
    }

    for (const [key, bucket] of this.sessionBuckets) {
      const filtered = bucket.filter(t => t > cutoff);
      if (filtered.length === 0) this.sessionBuckets.delete(key);
      else this.sessionBuckets.set(key, filtered);
    }

    this.globalBucket = this.globalBucket.filter(t => t > cutoff);
  }
}
