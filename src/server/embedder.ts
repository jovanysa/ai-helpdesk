/** Turns texts into vectors that are close together when the texts mean similar things. */
export type EmbedFn = (texts: string[]) => Promise<number[][]>;

export const DEFAULT_EMBED_MODEL = 'granite-embedding:278m';

export interface OllamaEmbedderConfig {
  url: string;
  model: string;
  fetchFn?: typeof fetch;
}

export function createOllamaEmbedder({ url, model, fetchFn = fetch }: OllamaEmbedderConfig): EmbedFn {
  return async (texts) => {
    if (texts.length === 0) return [];

    let response: Response;
    try {
      response = await fetchFn(`${url}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: texts }),
      });
    } catch (error) {
      throw new Error(`Ollama is not reachable at ${url}. Start it with \`ollama serve\`.`, { cause: error });
    }

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 404 || body.includes('not found')) {
        throw new Error(`Embedding model "${model}" is not downloaded. Run \`ollama pull ${model}\`.`);
      }
      throw new Error(`Ollama embed failed: HTTP ${response.status}`);
    }
    return ((await response.json()) as { embeddings: number[][] }).embeddings;
  };
}
