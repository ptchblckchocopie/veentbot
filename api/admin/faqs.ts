import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBot } from '../_bot.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const bot = await getBot();

  // GET — list all FAQs
  if (req.method === 'GET') {
    const faqs = await bot.getAllFAQs();
    return res.status(200).json(faqs);
  }

  // POST — add or update FAQ
  if (req.method === 'POST') {
    const { id, question, answer, category } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ error: 'Question and answer are required' });
    }

    const faqId = await bot.upsertFAQ({ id, question, answer, category });
    return res.status(200).json({ id: faqId, success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
