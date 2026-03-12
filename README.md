# VeentBot — AI FAQ Chatbot for Veent Tix

A self-contained, ever-learning FAQ chatbot built as a drop-in module for the Veent Tix platform. TypeScript core, framework-agnostic, $0 operating cost.

## Features

- **Tiered retrieval**: Tier 1 (exact match, no LLM), Tier 2 (grounded RAG via LLM), Tier 3 (graceful decline)
- **Dual-vector search** + keyword full-text search + Reciprocal Rank Fusion (RRF)
- **Streaming responses** via SSE — tokens appear in real-time
- **Markdown rendering** in chat bubbles (bold, lists, links)
- **VeentBot personality** — witty, self-aware, bilingual (English + Tagalog)
- **Intent detection** — greetings, thanks, goodbye, help, complaints, off-topic, inappropriate content
- **Semantic caching** — repeated/similar questions return instantly
- **Multi-turn conversations** — follow-up questions use conversation context
- **Knowledge chunks** — ingest markdown docs (event listings, policies, etc.)
- **Continuous learning** — gap detector, feedback analyzer, stale detector, threshold advisor
- **Security** — input sanitization, prompt injection detection (18 patterns), output validation, rate limiting

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | TypeScript (ESM) |
| Embeddings | Nomic Embed Text via Ollama (768 dims) |
| LLM | Ollama (qwen2.5:3b) or Gemini 2.5 Flash-Lite |
| Database | PostgreSQL 17 + pgvector (Docker) |
| Tests | Vitest (75 tests) |

## Prerequisites

- **Node.js** 20+
- **Docker** (for PostgreSQL + pgvector)
- **Ollama** — https://ollama.ai

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url>
cd veent_bot
npm install

# 2. Start the database
docker compose up -d

# 3. Install Ollama models
ollama pull nomic-embed-text    # embedding model (~274MB)
ollama pull qwen2.5:3b          # LLM model (~1.9GB)

# 4. Configure environment
cp .env.example .env
# Edit .env if needed (defaults work out of the box)

# 5. Run database migrations
npm run migrate

# 6. Seed FAQ data and ingest docs
npm run seed
npm run ingest:docs

# 7. Start the dev server
npm run dev
```

Open http://localhost:3000 — VeentBot will greet you automatically.

## Project Structure

```
src/
  core/
    bot.ts              # Main orchestrator (query + queryStream pipelines)
    index.ts            # Entry point — createFAQBot()
    types.ts            # TypeScript interfaces
    config.ts           # Default configuration
    database/           # Schema, migrations, queries
    embedding/          # Ollama + Gemini embedding services
    llm/                # Ollama + Gemini LLM services, prompts
    retrieval/          # Search pipeline, RRF, tier router
    intent/             # Pre-retrieval intent detection
    security/           # Sanitization, guardrails, rate limiting
    learning/           # Gap detector, feedback, stale detector
  adapters/
    sveltekit/          # SvelteKit server adapter (drop-in)
  ui/
    ChatWidget.svelte   # Svelte 5 chat component
scripts/
  serve.ts              # Dev server (HTTP + SSE streaming)
  migrate.ts            # Database migrations
  seed-faqs.ts          # Seed FAQ entries
  ingest-docs.ts        # Ingest markdown documents
  chat.ts               # CLI chat interface
public/
  index.html            # Chat UI (standalone demo)
  admin.html            # Admin panel for FAQ management
data/
  faqs/                 # FAQ YAML files
  docs/                 # Markdown documents (events, policies)
tests/
  unit/                 # Unit tests
  integration/          # Integration tests (requires DB)
```

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server at http://localhost:3000 |
| `npm test` | Run all tests |
| `npm run migrate` | Run database migrations |
| `npm run seed` | Seed FAQ entries from data/faqs/ |
| `npm run ingest:docs` | Ingest markdown docs from data/docs/ |
| `npm run build` | Compile TypeScript to dist/ |
| `npm run db:up` | Start PostgreSQL container |
| `npm run db:down` | Stop PostgreSQL container |
| `npm run eval` | Run evaluation suite |
| `npm run calibrate` | Calibrate similarity thresholds |

## Integration into Veent Website

### Option A: SvelteKit Adapter (recommended)

```typescript
// src/routes/api/chat/+server.ts
import { createChatHandler } from 'veent-bot/adapters/sveltekit';

const handler = createChatHandler({
  database: { connectionString: process.env.DATABASE_URL },
  companyName: 'Veent Tix',
  embedding: { provider: 'ollama', baseUrl: process.env.OLLAMA_BASE_URL },
  llm: { provider: 'ollama', model: 'qwen2.5:3b' },
});

export const POST = handler;
```

### Option B: Direct Core API

```typescript
import { createFAQBot } from 'veent-bot';

const bot = await createFAQBot({
  database: { connectionString: process.env.DATABASE_URL },
  companyName: 'Veent Tix',
  embedding: { provider: 'ollama' },
  llm: { provider: 'ollama', model: 'qwen2.5:3b' },
});

// Non-streaming
const result = await bot.query('How do I buy tickets?');

// Streaming
for await (const event of bot.queryStream('What events are in April?')) {
  if (event.type === 'chunk') process.stdout.write(event.text);
  if (event.type === 'meta') console.log(event.data);
}
```

## API Endpoints (Dev Server)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Chat UI |
| GET | `/admin` | Admin panel |
| POST | `/api/chat` | Send message (JSON response) |
| POST | `/api/chat/stream` | Send message (SSE streaming) |
| GET | `/api/admin/faqs` | List all FAQs |
| POST | `/api/admin/faqs` | Add/update FAQ |
| DELETE | `/api/admin/faqs/:id` | Delete FAQ |
| GET | `/api/health` | Health check |

## Environment Variables

See `.env.example` for all options. Key settings:

- `LLM_PROVIDER` — `ollama` (local, free) or `gemini` (cloud, free tier with daily limits)
- `LLM_MODEL` — Model name (default: `qwen2.5:3b` for Ollama)
- `DATABASE_URL` — PostgreSQL connection string
- `OLLAMA_BASE_URL` — Ollama API URL (default: http://localhost:11434)

## Architecture

See `MASTERPLAN.md` for the full architectural design document.
