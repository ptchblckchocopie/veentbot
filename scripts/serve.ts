import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFAQBot } from '../src/core/index.js';
import { closeDatabase } from '../src/core/database/index.js';
import 'dotenv/config';

const PORT = parseInt(process.env.PORT || '3000');

async function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body;
}

async function main() {
  console.log('Starting Veent Tix Bot server...\n');

  const bot = await createFAQBot({
    database: { connectionString: process.env.DATABASE_URL! },
    companyName: process.env.COMPANY_NAME || 'Veent Tix',
    embedding: { provider: 'ollama', baseUrl: process.env.OLLAMA_BASE_URL },
    llm: {
      provider: (process.env.LLM_PROVIDER as 'gemini' | 'ollama') || 'ollama',
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.LLM_MODEL,
      baseUrl: process.env.OLLAMA_BASE_URL,
    },
  });

  const publicDir = join(import.meta.dirname, '..', 'public');
  const indexHtml = readFileSync(join(publicDir, 'index.html'), 'utf-8');
  const adminHtml = readFileSync(join(publicDir, 'admin.html'), 'utf-8');

  const server = createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://localhost:${PORT}`);

    try {
      // ── Serve HTML ──
      if (url.pathname === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(indexHtml);
        return;
      }

      if (url.pathname === '/admin' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(adminHtml);
        return;
      }

      // ── Chat API (non-streaming) ──
      if (url.pathname === '/api/chat' && req.method === 'POST') {
        const body = await readBody(req);
        const { message, sessionId } = JSON.parse(body);

        if (!message || typeof message !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Message is required' }));
          return;
        }

        const start = Date.now();
        const result = await bot.query(message, sessionId || undefined);
        const duration = Date.now() - start;

        console.log(
          `  [${result.tier}] "${message.substring(0, 50)}" → ${result.confidence.toFixed(3)} (${duration}ms)${result.cached ? ' [cached]' : ''}`
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          answer: result.answer,
          confidence: result.confidence,
          tier: result.tier,
          cached: result.cached,
          sessionId: result.sessionId,
          suggestedQuestions: result.suggestedQuestions,
        }));
        return;
      }

      // ── Chat API (SSE streaming) ──
      if (url.pathname === '/api/chat/stream' && req.method === 'POST') {
        const body = await readBody(req);
        const { message, sessionId } = JSON.parse(body);

        if (!message || typeof message !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Message is required' }));
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        const start = Date.now();

        try {
          const stream = bot.queryStream(message, sessionId || undefined);

          for await (const event of stream) {
            if (event.type === 'chunk') {
              res.write(`data: ${JSON.stringify({ type: 'chunk', text: event.text })}\n\n`);
            } else if (event.type === 'meta') {
              const duration = Date.now() - start;
              console.log(
                `  [${event.data.tier}] "${message.substring(0, 50)}" → ${event.data.confidence.toFixed(3)} (${duration}ms)${event.data.cached ? ' [cached]' : ''} [streamed]`
              );
              res.write(`data: ${JSON.stringify({ type: 'meta', ...event.data })}\n\n`);
            }
          }
        } catch (err) {
          console.error('Stream error:', err);
          res.write(`data: ${JSON.stringify({ type: 'error', message: 'Internal server error' })}\n\n`);
        }

        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      // ── Admin: List FAQs ──
      if (url.pathname === '/api/admin/faqs' && req.method === 'GET') {
        const faqs = await bot.getAllFAQs();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(faqs));
        return;
      }

      // ── Admin: Add / Update FAQ ──
      if (url.pathname === '/api/admin/faqs' && req.method === 'POST') {
        const body = await readBody(req);
        const { id, question, answer, category } = JSON.parse(body);

        if (!question || !answer) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Question and answer are required' }));
          return;
        }

        const faqId = await bot.upsertFAQ({ id, question, answer, category });
        console.log(`  [admin] ${id ? 'Updated' : 'Added'} FAQ: "${question.substring(0, 50)}" → ${faqId}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: faqId, success: true }));
        return;
      }

      // ── Admin: Delete FAQ ──
      const deleteMatch = url.pathname.match(/^\/api\/admin\/faqs\/(.+)$/);
      if (deleteMatch && req.method === 'DELETE') {
        const faqId = deleteMatch[1];
        await bot.deleteFAQ(faqId);
        console.log(`  [admin] Deleted FAQ: ${faqId}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      // ── Health Check ──
      if (url.pathname === '/api/health' && req.method === 'GET') {
        const health = await bot.healthCheck();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(health));
        return;
      }

      // ── 404 ──
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));

    } catch (err) {
      console.error('Server error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });

  server.listen(PORT, () => {
    console.log(`  Chat:    http://localhost:${PORT}`);
    console.log(`  Admin:   http://localhost:${PORT}/admin`);
    console.log(`  Health:  http://localhost:${PORT}/api/health`);
    console.log('');
    console.log('  Press Ctrl+C to stop.\n');
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down...');
    server.close();
    await closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => { console.error(err); process.exit(1); });
