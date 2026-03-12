/**
 * Content Ingestion Script
 *
 * Reads raw text files from data/raw/ and uses an LLM to auto-generate
 * Q&A pairs, which are saved to data/generated/candidates.yaml for human review.
 *
 * Usage:
 *   npx tsx scripts/ingest-content.ts
 *
 * Flow:
 *   data/raw/*.txt → LLM generates Q&A candidates → data/generated/candidates.yaml
 *   Then: review candidates.yaml, copy approved entries to data/faqs.yaml, run npm run seed
 */

import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { stringify } from 'yaml';
import 'dotenv/config';

interface GeneratedFAQ {
  question: string;
  answer: string;
  category: string;
  source_file: string;
}

async function generateQAPairs(content: string, sourceFile: string, apiKey: string): Promise<GeneratedFAQ[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

  const prompt = `You are a Q&A extraction expert. Read the following company content and generate every question that a customer or user might ask, along with the correct answer based ONLY on the provided text.

Rules:
1. Generate 3-15 Q&A pairs depending on how much content there is.
2. Questions should be natural — how a real person would ask.
3. Answers must come ONLY from the provided text. Do NOT make up information.
4. Each answer should be self-contained (no "see above" or "as mentioned").
5. Keep answers concise — 1-3 sentences.
6. Suggest a category for each Q&A (e.g., "general", "pricing", "services", "policies", "support", "technical", "billing").

Respond ONLY with a JSON array of objects, each with "question", "answer", and "category" fields. No other text.

Content:
---
${content}
---`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API failed for ${sourceFile}: ${response.status} ${error}`);
  }

  const data = await response.json() as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';

  try {
    const pairs = JSON.parse(text) as Array<{ question: string; answer: string; category: string }>;
    return pairs.map(p => ({
      question: p.question,
      answer: p.answer,
      category: p.category || 'general',
      source_file: sourceFile,
    }));
  } catch {
    console.error(`  Failed to parse LLM output for ${sourceFile}. Raw output:`);
    console.error(`  ${text.substring(0, 200)}`);
    return [];
  }
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not set in .env');
    console.error('Get a free key at: https://aistudio.google.com/apikey');
    process.exit(1);
  }

  const rawDir = join(import.meta.dirname, '..', 'data', 'raw');
  const generatedDir = join(import.meta.dirname, '..', 'data', 'generated');

  if (!existsSync(rawDir)) {
    mkdirSync(rawDir, { recursive: true });
  }
  mkdirSync(generatedDir, { recursive: true });

  const files = readdirSync(rawDir).filter(f => f.endsWith('.txt'));

  if (files.length === 0) {
    console.log('No .txt files found in data/raw/');
    console.log('Add your company content as .txt files there and run again.');
    console.log('\nExample:');
    console.log('  data/raw/about.txt     — About us page content');
    console.log('  data/raw/pricing.txt   — Pricing page content');
    console.log('  data/raw/policies.txt  — Terms and policies');
    process.exit(0);
  }

  console.log(`Found ${files.length} content file(s) in data/raw/\n`);

  const allCandidates: GeneratedFAQ[] = [];

  for (const file of files) {
    const filePath = join(rawDir, file);
    const content = readFileSync(filePath, 'utf-8').trim();

    if (!content) {
      console.log(`  Skipping ${file} (empty)`);
      continue;
    }

    console.log(`Processing: ${file} (${content.length} chars)...`);

    try {
      const pairs = await generateQAPairs(content, file, apiKey);
      console.log(`  Generated ${pairs.length} Q&A pairs`);
      allCandidates.push(...pairs);
    } catch (err) {
      console.error(`  Error processing ${file}:`, err);
    }

    // Rate limit: wait 2s between files (Gemini free tier: ~15 RPM)
    if (files.indexOf(file) < files.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (allCandidates.length === 0) {
    console.log('\nNo Q&A pairs generated.');
    process.exit(0);
  }

  // Save candidates for human review
  const outputPath = join(generatedDir, 'candidates.yaml');
  const output = {
    _instructions: 'Review these auto-generated Q&A pairs. Copy approved ones to data/faqs.yaml, then run: npm run seed',
    _generated_at: new Date().toISOString(),
    _total: allCandidates.length,
    faqs: allCandidates.map(c => ({
      question: c.question,
      answer: c.answer,
      category: c.category,
      metadata: { source: 'auto-extracted', source_file: c.source_file },
    })),
  };

  writeFileSync(outputPath, stringify(output), 'utf-8');

  console.log(`\n=== Done! ===`);
  console.log(`Generated ${allCandidates.length} Q&A candidates from ${files.length} file(s)`);
  console.log(`\nReview them at: data/generated/candidates.yaml`);
  console.log(`Copy approved entries to: data/faqs.yaml`);
  console.log(`Then run: npm run seed`);
}

main().catch(err => { console.error(err); process.exit(1); });
