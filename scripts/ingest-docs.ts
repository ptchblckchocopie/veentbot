import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { createFAQBot } from '../src/core/index.js';
import { getPool, closeDatabase } from '../src/core/database/index.js';
import * as queries from '../src/core/database/queries.js';
import { chunkMarkdown } from '../src/core/knowledge/chunker.js';
import { buildConfig } from '../src/core/config.js';
import { OllamaEmbeddingService } from '../src/core/embedding/ollama.js';
import { GeminiEmbeddingService } from '../src/core/embedding/gemini.js';
import type { EmbeddingService } from '../src/core/types.js';
import 'dotenv/config';

async function main() {
  const docsDir = join(import.meta.dirname, '..', 'data', 'docs');
  const files = readdirSync(docsDir).filter(f => f.endsWith('.md') || f.endsWith('.txt'));

  if (files.length === 0) {
    console.log('No documents found in data/docs/');
    console.log('Add .md or .txt files there and run again.');
    process.exit(0);
  }

  // Initialize embedding service
  const provider = (process.env.EMBEDDING_PROVIDER as 'gemini' | 'ollama') || 'ollama';
  let embeddingService: EmbeddingService;

  if (provider === 'gemini') {
    embeddingService = new GeminiEmbeddingService(process.env.GEMINI_API_KEY!);
  } else {
    embeddingService = new OllamaEmbeddingService(
      process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
    );
  }

  const config = buildConfig({
    database: { connectionString: process.env.DATABASE_URL! },
    companyName: process.env.COMPANY_NAME || 'Veent Tix',
    embedding: { provider },
  });

  const pool = getPool(config.database.connectionString);

  // Skip schema init in this script — just connect
  await pool.query('SELECT 1');

  console.log(`Found ${files.length} document(s). Ingesting with ${provider} embeddings...\n`);

  let totalChunks = 0;

  for (const file of files) {
    const filePath = join(docsDir, file);
    const content = readFileSync(filePath, 'utf-8');
    const docName = basename(file, file.endsWith('.md') ? '.md' : '.txt');

    console.log(`Processing: ${file}`);

    // Chunk the document
    const chunks = chunkMarkdown(content, { maxChunkSize: 1200, overlapSentences: 2 });
    console.log(`  → ${chunks.length} chunks`);

    // Delete old chunks for this document (re-ingestion)
    const deleted = await queries.deleteChunksByDocument(pool, docName);
    if (deleted > 0) {
      console.log(`  → Deleted ${deleted} old chunks`);
    }

    // Embed and store each chunk
    for (const chunk of chunks) {
      const textToEmbed = chunk.heading
        ? `${chunk.heading}\n\n${chunk.content}`
        : chunk.content;

      const embedding = await embeddingService.embed(textToEmbed);

      await queries.upsertChunk(
        pool,
        docName,
        chunk.heading || null,
        chunk.content,
        chunk.index,
        embedding,
        { sourceFile: file }
      );
    }

    totalChunks += chunks.length;
    console.log(`  → Stored ${chunks.length} chunks\n`);
  }

  console.log(`\nDone! Ingested ${totalChunks} chunks from ${files.length} document(s).`);

  await closeDatabase();
}

main().catch(err => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
