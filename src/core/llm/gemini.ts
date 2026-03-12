import type { LLMService, LLMResponse } from '../types.js';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

// Fallback models when primary is rate-limited (each has separate quota)
const FALLBACK_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

export class GeminiLLMService implements LLMService {
  private apiKey: string;
  private model: string;
  private maxTokens: number;

  constructor(apiKey: string, model: string = 'gemini-2.5-flash', maxTokens: number = 500) {
    this.apiKey = apiKey;
    this.model = model;
    this.maxTokens = maxTokens;
  }

  async generate(systemPrompt: string, userMessage: string): Promise<LLMResponse> {
    return this.chat(systemPrompt, [{ role: 'user', text: userMessage }]);
  }

  /**
   * Multi-turn chat: sends conversation history + new message to Gemini.
   * Automatically falls back to alternate models on rate limit (429).
   */
  async chat(systemPrompt: string, messages: ChatMessage[]): Promise<LLMResponse> {
    const contents = messages.map(m => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));

    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        maxOutputTokens: this.maxTokens,
        temperature: 0.3,
      },
    };

    // Try primary model first, then fallbacks
    const modelsToTry = [this.model, ...FALLBACK_MODELS.filter(m => m !== this.model)];

    for (const model of modelsToTry) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.status === 429) {
        console.log(`Model ${model} rate-limited, trying next...`);
        continue;
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API failed: ${response.status} ${error}`);
      }

      const data = await response.json() as {
        candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
        usageMetadata?: { totalTokenCount?: number };
      };

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const tokensUsed = data.usageMetadata?.totalTokenCount ?? 0;

      return { text, model, tokensUsed };
    }

    throw new Error('All Gemini models rate-limited');
  }

  /**
   * Streaming multi-turn chat: yields text chunks as they arrive from Gemini.
   * Falls back to alternate models on rate limit (429).
   */
  async *chatStream(systemPrompt: string, messages: ChatMessage[]): AsyncGenerator<string, LLMResponse> {
    const contents = messages.map(m => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));

    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        maxOutputTokens: this.maxTokens,
        temperature: 0.3,
      },
    };

    const modelsToTry = [this.model, ...FALLBACK_MODELS.filter(m => m !== this.model)];

    for (const model of modelsToTry) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.status === 429) {
        console.log(`Model ${model} rate-limited (stream), trying next...`);
        continue;
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini streaming API failed: ${response.status} ${error}`);
      }

      if (!response.body) {
        throw new Error('No response body for streaming');
      }

      let fullText = '';
      let tokensUsed = 0;
      const decoder = new TextDecoder();
      const reader = response.body.getReader();

      try {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === '[DONE]') continue;

            try {
              const data = JSON.parse(jsonStr) as {
                candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
                usageMetadata?: { totalTokenCount?: number };
              };

              const chunk = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (chunk) {
                fullText += chunk;
                yield chunk;
              }

              if (data.usageMetadata?.totalTokenCount) {
                tokensUsed = data.usageMetadata.totalTokenCount;
              }
            } catch {
              // Skip malformed JSON chunks
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      return { text: fullText, model, tokensUsed };
    }

    throw new Error('All Gemini models rate-limited');
  }

  /**
   * Quick single-purpose generation (for query rewriting, etc.)
   * Also rotates through models on rate limit.
   */
  async quickGenerate(prompt: string, maxTokens: number = 100): Promise<string> {
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.1 },
    };

    const modelsToTry = [this.model, ...FALLBACK_MODELS.filter(m => m !== this.model)];

    for (const model of modelsToTry) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.status === 429) continue;
      if (!response.ok) throw new Error(`Gemini quickGenerate failed: ${response.status}`);

      const data = await response.json() as {
        candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
      };
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    }

    throw new Error('All Gemini models rate-limited');
  }
}
