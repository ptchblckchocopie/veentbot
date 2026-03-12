/**
 * SvelteKit API Adapter
 *
 * Drop these route handlers into your SvelteKit project:
 *
 *   src/routes/api/chat/+server.ts        → chatHandler (POST)
 *   src/routes/api/chat/session/+server.ts → sessionHandler (GET)
 *   src/routes/api/chat/feedback/+server.ts → feedbackHandler (POST)
 *   src/routes/api/health/+server.ts       → healthHandler (GET)
 *
 * Example +server.ts:
 *
 *   import { chatHandler } from 'veent-bot/adapters/sveltekit';
 *   export const POST = chatHandler(bot, rateLimiter);
 */

import type { FAQBot } from '../../core/bot.js';
import type { RateLimiter } from '../../core/security/rate-limiter.js';

type RequestEvent = {
  request: Request;
  url: URL;
  getClientAddress: () => string;
};

function json(data: unknown, status: number = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/**
 * POST /api/chat
 * Body: { question: string, sessionId?: string }
 */
export function chatHandler(bot: FAQBot, rateLimiter?: RateLimiter) {
  return async (event: RequestEvent) => {
    // Rate limiting
    if (rateLimiter) {
      const ip = event.getClientAddress();
      const body = await event.request.clone().json().catch(() => ({}));
      const limit = rateLimiter.check(ip, body.sessionId);
      if (!limit.allowed) {
        return json(
          { error: 'Too many requests. Please try again later.' },
          429,
          { 'Retry-After': String(Math.ceil((limit.retryAfterMs || 5000) / 1000)) }
        );
      }
    }

    try {
      const body = await event.request.json();
      const { question, sessionId } = body as { question?: string; sessionId?: string };

      if (!question || typeof question !== 'string') {
        return json({ error: 'Missing "question" in request body' }, 400);
      }

      const response = await bot.query(question, sessionId);
      return json(response);
    } catch (err) {
      console.error('Chat handler error:', err);
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }
  };
}

/**
 * GET /api/chat/session?id=<sessionId>
 */
export function sessionHandler(bot: FAQBot) {
  return async (event: RequestEvent) => {
    try {
      const sessionId = event.url.searchParams.get('id');
      if (!sessionId) {
        return json({ error: 'Missing "id" query parameter' }, 400);
      }

      const messages = await bot.getSession(sessionId);
      return json({ sessionId, messages });
    } catch (err) {
      console.error('Session handler error:', err);
      return json({ error: 'Something went wrong.' }, 500);
    }
  };
}

/**
 * POST /api/chat/feedback
 * Body: { messageId: string, sessionId: string, rating: 'positive' | 'negative', comment?: string }
 */
export function feedbackHandler(bot: FAQBot) {
  return async (event: RequestEvent) => {
    try {
      const body = await event.request.json();
      const { messageId, sessionId, rating, comment } = body as {
        messageId?: string; sessionId?: string; rating?: string; comment?: string;
      };

      if (!messageId || !sessionId || !rating) {
        return json({ error: 'Missing required fields: messageId, sessionId, rating' }, 400);
      }

      if (rating !== 'positive' && rating !== 'negative') {
        return json({ error: 'Rating must be "positive" or "negative"' }, 400);
      }

      await bot.submitFeedback(messageId, sessionId, rating, comment);
      return json({ success: true });
    } catch (err) {
      console.error('Feedback handler error:', err);
      return json({ error: 'Something went wrong.' }, 500);
    }
  };
}

/**
 * GET /api/health
 */
export function healthHandler(bot: FAQBot) {
  return async () => {
    const health = await bot.healthCheck();
    const status = health.database && health.embedding ? 200 : 503;
    return json(health, status);
  };
}
