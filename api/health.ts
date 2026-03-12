import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBot } from './_bot.js';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const bot = await getBot();
    const health = await bot.healthCheck();
    return res.status(200).json(health);
  } catch (err) {
    return res.status(500).json({ database: false, embedding: false });
  }
}
