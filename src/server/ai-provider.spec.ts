import { AiMessage, OllamaProvider, readLines, warmUpOllama } from './ai-provider';

function streamOf(chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

const messages: AiMessage[] = [{ role: 'user', content: 'hi' }];

describe('readLines', () => {
  it('joins a line that is split across chunks', async () => {
    const lines = await collect(readLines(streamOf(['{"a":', '1}\n{"b":2}\n'])));
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('keeps Arabic characters intact when their bytes are split across chunks', async () => {
    const bytes = new TextEncoder().encode('أهلًا\n');
    const lines = await collect(readLines(streamOf([bytes.slice(0, 3), bytes.slice(3)])));
    expect(lines).toEqual(['أهلًا']);
  });

  it('returns a last line that has no trailing newline', async () => {
    const lines = await collect(readLines(streamOf(['one\ntwo'])));
    expect(lines).toEqual(['one', 'two']);
  });
});

describe('OllamaProvider', () => {
  function provider(fetchFn: typeof fetch) {
    return new OllamaProvider({ url: 'http://ollama.test', model: 'test-model', fetchFn });
  }

  it('yields the content of each streamed chunk and stops at done', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        streamOf([
          '{"message":{"content":"أهلًا"},"done":false}\n{"message":{"content":" بيك"},"done":false}\n',
          '{"message":{"content":""},"done":true}\n',
        ]),
      ),
    );

    const tokens = await collect(provider(fetchFn).streamChat(messages, new AbortController().signal));

    expect(tokens).toEqual(['أهلًا', ' بيك']);
  });

  it('posts the model, messages and stream flag to /api/chat', async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(streamOf(['{"done":true}\n'])),
    );

    await collect(provider(fetchFn as typeof fetch).streamChat(messages, new AbortController().signal));

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://ollama.test/api/chat');
    expect(JSON.parse(init!.body as string)).toEqual({
      model: 'test-model',
      messages,
      stream: true,
      think: false,
      keep_alive: '30m',
      options: { num_predict: 512, temperature: 0.2 },
    });
  });

  it('explains how to start Ollama when it is not reachable', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });

    await expect(
      collect(provider(fetchFn).streamChat(messages, new AbortController().signal)),
    ).rejects.toThrow(/ollama serve/);
  });

  it('explains how to download the model when Ollama returns 404', async () => {
    const fetchFn = vi.fn(async () => new Response('{"error":"model not found"}', { status: 404 }));

    await expect(
      collect(provider(fetchFn).streamChat(messages, new AbortController().signal)),
    ).rejects.toThrow(/ollama pull test-model/);
  });

  it('throws when a streamed chunk contains an error', async () => {
    const fetchFn = vi.fn(async () => new Response(streamOf(['{"error":"out of memory"}\n'])));

    await expect(
      collect(provider(fetchFn).streamChat(messages, new AbortController().signal)),
    ).rejects.toThrow(/out of memory/);
  });
});

describe('warmUpOllama', () => {
  it('asks Ollama to load the model and keep it loaded', async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response('{}'));
    await warmUpOllama({ url: 'http://ollama.test', model: 'm', fetchFn: fetchFn as typeof fetch });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://ollama.test/api/generate');
    expect(JSON.parse(init!.body as string)).toEqual({ model: 'm', keep_alive: '30m' });
  });

  it('only logs when Ollama is not running', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchFn = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(warmUpOllama({ url: 'http://x', model: 'm', fetchFn })).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith('[ollama] could not load m:', 'fetch failed');
  });
});
