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

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const stream = bot.queryStream(message, sessionId || undefined);

    for await (const event of stream) {
      if (event.type === 'chunk') {
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: event.text })}\n\n`);
      } else if (event.type === 'meta') {
        res.write(`data: ${JSON.stringify({ type: 'meta', ...event.data })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Chat stream error:', err);
    const message = err instanceof Error ? err.message : String(err);

    // If headers not sent yet, return JSON error
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error', detail: message });
    }

    // If streaming already started, send error event
    res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
    res.end();
  }
}
