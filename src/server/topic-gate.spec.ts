import { TOPIC_GATE_PROMPT, createOllamaTopicGate } from './topic-gate';

const reply = (value: boolean) => new Response(JSON.stringify({ message: { content: JSON.stringify({ about_foundation: value }) } }));

describe('createOllamaTopicGate', () => {
  it('asks the model for a JSON yes/no and returns it', async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => reply(false));
    const isAboutFoundation = createOllamaTopicGate({ url: 'http://ollama.test', model: 'm', fetchFn: fetchFn as typeof fetch });

    expect(await isAboutFoundation('What is the capital of France?')).toBe(false);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://ollama.test/api/chat');
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({ model: 'm', stream: false, options: { temperature: 0 } });
    expect(body.format).toEqual({
      type: 'object',
      properties: { about_foundation: { type: 'boolean' } },
      required: ['about_foundation'],
    });
    expect(body.messages).toEqual([
      { role: 'system', content: TOPIC_GATE_PROMPT },
      { role: 'user', content: 'What is the capital of France?' },
    ]);
  });

  it('returns true for a foundation question', async () => {
    const gate = createOllamaTopicGate({ url: 'http://x', model: 'm', fetchFn: vi.fn(async () => reply(true)) });
    expect(await gate('ازاي اتبرع؟')).toBe(true);
  });

  it('throws on an HTTP error or a malformed answer', async () => {
    const failing = createOllamaTopicGate({ url: 'http://x', model: 'm', fetchFn: vi.fn(async () => new Response('', { status: 500 })) });
    await expect(failing('x')).rejects.toThrow(/500/);
    const malformed = createOllamaTopicGate({
      url: 'http://x',
      model: 'm',
      fetchFn: vi.fn(async () => new Response(JSON.stringify({ message: { content: '{"yes":1}' } }))),
    });
    await expect(malformed('x')).rejects.toThrow();
  });

  it('lists the foundation topics and examples in its prompt', () => {
    for (const text of ['donating', 'volunteering', 'opening days', '"about_foundation": false']) {
      expect(TOPIC_GATE_PROMPT).toContain(text);
    }
  });
});
