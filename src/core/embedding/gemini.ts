import type { EmbeddingService } from '../types.js';

export class GeminiEmbeddingService implements EmbeddingService {
  private apiKey: string;
  private model: string;
  private dimensions: number;

  constructor(apiKey: string, model: string = 'gemini-embedding-001', dimensions: number = 768) {
    this.apiKey = apiKey;
    this.model = model;
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        outputDimensionality: this.dimensions,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini embedding failed: ${response.status} ${error}`);
    }

    const data = await response.json() as {
      embedding: { values: number[] };
    };

    return data.embedding.values;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:batchEmbedContents?key=${this.apiKey}`;

    const requests = texts.map(text => ({
      model: `models/${this.model}`,
      content: { parts: [{ text }] },
      outputDimensionality: this.dimensions,
    }));

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini batch embedding failed: ${response.status} ${error}`);
    }

    const data = await response.json() as {
      embeddings: Array<{ values: number[] }>;
    };

    return data.embeddings.map(e => e.values);
  }
}
