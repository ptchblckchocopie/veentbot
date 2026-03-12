import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBot } from './_bot.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, sessionId } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const bot = await getBot();
    const result = await bot.query(message, sessionId || undefined);

    return res.status(200).json({
      answer: result.answer,
      confidence: result.confidence,
      tier: result.tier,
      cached: result.cached,
      sessionId: result.sessionId,
      suggestedQuestions: result.suggestedQuestions,
    });
  } catch (err) {
    console.error('Chat error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: 'Internal server error', detail: message });
  }
}
