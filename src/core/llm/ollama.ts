import type { LLMService, LLMResponse } from '../types.js';
import type { ChatMessage } from './gemini.js';

export class OllamaLLMService implements LLMService {
  private baseUrl: string;
  private model: string;
  private maxTokens: number;

  constructor(baseUrl: string = 'http://localhost:11434', model: string = 'qwen2.5:3b', maxTokens: number = 500) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
    this.maxTokens = maxTokens;
  }

  async generate(systemPrompt: string, userMessage: string): Promise<LLMResponse> {
    return this.chat(systemPrompt, [{ role: 'user', text: userMessage }]);
  }

  /**
   * Multi-turn chat via Ollama's /api/chat endpoint.
   */
  async chat(systemPrompt: string, messages: ChatMessage[]): Promise<LLMResponse> {
    const ollamaMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.role === 'model' ? 'assistant' : 'user',
        content: m.text,
      })),
    ];

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: ollamaMessages,
        stream: false,
        options: {
          num_predict: this.maxTokens,
          temperature: 0.3,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama chat failed: ${response.status} ${error}`);
    }

    const data = await response.json() as {
      message: { content: string };
      model: string;
      eval_count?: number;
      prompt_eval_count?: number;
    };

    return {
      text: data.message.content,
      model: data.model,
      tokensUsed: (data.eval_count || 0) + (data.prompt_eval_count || 0),
    };
  }

  /**
   * Streaming multi-turn chat via Ollama's /api/chat endpoint.
   */
  async *chatStream(systemPrompt: string, messages: ChatMessage[]): AsyncGenerator<string, LLMResponse> {
    const ollamaMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.role === 'model' ? 'assistant' : 'user',
        content: m.text,
      })),
    ];

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: ollamaMessages,
        stream: true,
        options: {
          num_predict: this.maxTokens,
          temperature: 0.3,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama streaming failed: ${response.status} ${error}`);
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

        // Ollama streams one JSON object per line
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line) as {
              message?: { content?: string };
              done?: boolean;
              eval_count?: number;
              prompt_eval_count?: number;
            };

            if (data.message?.content) {
              fullText += data.message.content;
              yield data.message.content;
            }

            if (data.done) {
              tokensUsed = (data.eval_count || 0) + (data.prompt_eval_count || 0);
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { text: fullText, model: this.model, tokensUsed };
  }

  /**
   * Quick single-purpose generation (for query rewriting, etc.)
   */
  async quickGenerate(prompt: string, maxTokens: number = 100): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        options: {
          num_predict: maxTokens,
          temperature: 0.1,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama quickGenerate failed: ${response.status}`);
    }

    const data = await response.json() as { response: string };
    return data.response.trim();
  }
}
