export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Anything that can stream a chat reply piece by piece.
 * Swap the implementation to move to a different AI backend.
 */
export interface AiProvider {
  streamChat(messages: AiMessage[], signal: AbortSignal): AsyncIterable<string>;
}

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
export const DEFAULT_OLLAMA_MODEL = 'qwen2.5:3b';

export interface OllamaConfig {
  url: string;
  model: string;
  /** Upper bound on reply length, in tokens. */
  maxTokens?: number;
  /** Injected in tests; defaults to the global fetch. */
  fetchFn?: typeof fetch;
}

interface OllamaChunk {
  message?: { content?: string };
  done?: boolean;
  error?: string;
}

export class OllamaProvider implements AiProvider {
  constructor(private readonly config: OllamaConfig) {}

  async *streamChat(messages: AiMessage[], signal: AbortSignal): AsyncGenerator<string> {
    const { url, model, maxTokens = 512, fetchFn = fetch } = this.config;

    let response: Response;
    try {
      response = await fetchFn(`${url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          // Thinking models (e.g. qwen3) would reason at length before answering; ignored by others.
          think: false,
          // Low temperature: fewer surprises (switching language, inventing facts) from a small model.
          options: { num_predict: maxTokens, temperature: 0.2 },
        }),
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Error(`Ollama is not reachable at ${url}. Start it with \`ollama serve\`.`, {
        cause: error,
      });
    }

    if (response.status === 404) {
      throw new Error(`Model "${model}" is not downloaded. Run \`ollama pull ${model}\`.`);
    }
    if (!response.ok || !response.body) {
      throw new Error(`Ollama returned HTTP ${response.status}.`);
    }

    // Ollama streams NDJSON: one JSON object per line.
    for await (const line of readLines(response.body)) {
      const chunk = JSON.parse(line) as OllamaChunk;
      if (chunk.error) throw new Error(`Ollama error: ${chunk.error}`);
      const text = chunk.message?.content;
      if (text) yield text;
      if (chunk.done) return;
    }
  }
}

/** Splits a byte stream into non-empty text lines, even when lines or characters span chunks. */
export async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      // stream: true keeps a half-received multi-byte character for the next chunk.
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim()) yield line;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) yield buffer;
  } finally {
    reader.releaseLock();
  }
}
