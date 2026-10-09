import { createOllamaEmbedder } from './embedder';

describe('createOllamaEmbedder', () => {
  it('posts the model and inputs and returns the embeddings', async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ embeddings: [[1], [2]] })),
    );
    const embed = createOllamaEmbedder({ url: 'http://ollama.test', model: 'm', fetchFn: fetchFn as typeof fetch });
    expect(await embed(['a', 'b'])).toEqual([[1], [2]]);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://ollama.test/api/embed');
    expect(JSON.parse(init!.body as string)).toEqual({ model: 'm', input: ['a', 'b'], keep_alive: '30m' });
  });

  it('does not call Ollama for an empty list', async () => {
    const fetchFn = vi.fn();
    expect(await createOllamaEmbedder({ url: 'http://x', model: 'm', fetchFn })([])).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('explains how to download a missing model', async () => {
    const fetchFn = vi.fn(
      async () => new Response('{"error":"model \\"m\\" not found, try pulling it first"}', { status: 404 }),
    );
    await expect(createOllamaEmbedder({ url: 'http://x', model: 'm', fetchFn })(['a'])).rejects.toThrow(
      'Embedding model "m" is not downloaded. Run `ollama pull m`.',
    );
  });

  it('reports other HTTP errors', async () => {
    const fetchFn = vi.fn(async () => new Response('{"error":"boom"}', { status: 500 }));
    await expect(createOllamaEmbedder({ url: 'http://x', model: 'm', fetchFn })(['a'])).rejects.toThrow(
      'Ollama embed failed: HTTP 500',
    );
  });

  it('explains how to start Ollama when it is not reachable', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(createOllamaEmbedder({ url: 'http://x', model: 'm', fetchFn })(['a'])).rejects.toThrow(/ollama serve/);
  });
});
