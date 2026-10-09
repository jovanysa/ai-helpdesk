import { TOPIC_GATE_PROMPT, createOllamaTopicGate, gateInput } from './topic-gate';

const reply = (unrelated: boolean) => new Response(JSON.stringify({ message: { content: JSON.stringify({ unrelated }) } }));

describe('createOllamaTopicGate', () => {
  it('asks the model whether the current message is clearly unrelated', async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => reply(true));
    const isAboutFoundation = createOllamaTopicGate({ url: 'http://ollama.test', model: 'm', fetchFn: fetchFn as typeof fetch });

    expect(await isAboutFoundation('What is the capital of France?')).toBe(false);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://ollama.test/api/chat');
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({ model: 'm', stream: false, think: false, options: { temperature: 0 } });
    expect(body.format).toEqual({
      type: 'object',
      properties: { unrelated: { type: 'boolean' } },
      required: ['unrelated'],
    });
    expect(body.messages).toEqual([
      { role: 'system', content: TOPIC_GATE_PROMPT },
      { role: 'user', content: 'CURRENT: "What is the capital of France?"' },
    ]);
  });

  it('labels the previous message as context only', () => {
    expect(gateInput('وبالفيزا؟', 'ازاي اتبرع؟')).toBe('PREVIOUS: "ازاي اتبرع؟"\nCURRENT: "وبالفيزا؟"');
    expect(gateInput('hi')).toBe('CURRENT: "hi"');
  });

  it('treats anything not clearly unrelated as a foundation message', async () => {
    const gate = createOllamaTopicGate({ url: 'http://x', model: 'm', fetchFn: vi.fn(async () => reply(false)) });
    expect(await gate('السلام عليكم')).toBe(true);
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

  it('counts greetings and personal needs as related in its prompt', () => {
    for (const text of ['greetings and thanks', 'describing their own problem or need', 'If you are not sure, it is related.']) {
      expect(TOPIC_GATE_PROMPT).toContain(text);
    }
  });
});
