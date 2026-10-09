import { ANSWERABILITY_PROMPT, createOllamaAnswerabilityCheck } from './answerability';

const reply = (answerable: boolean) => new Response(JSON.stringify({ message: { content: JSON.stringify({ answerable }) } }));
const sources = [{ title: 'المواعيد', content: 'الجمعة: مقفول.' }];

describe('createOllamaAnswerabilityCheck', () => {
  it('asks whether the sources contain the answer, with the sources in the prompt', async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => reply(true));
    const check = createOllamaAnswerabilityCheck({ url: 'http://ollama.test', model: 'm', fetchFn: fetchFn as typeof fetch });

    expect(await check('انتو فاتحين يوم الجمعة؟', sources)).toBe(true);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://ollama.test/api/chat');
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({ model: 'm', stream: false, think: false, keep_alive: '30m', options: { temperature: 0 } });
    expect(body.format).toEqual({
      type: 'object',
      properties: { answerable: { type: 'boolean' } },
      required: ['answerable'],
    });
    expect(body.messages[0].content).toContain('SOURCES:\n[1] المواعيد\nالجمعة: مقفول.');
    expect(body.messages[1]).toEqual({ role: 'user', content: 'QUESTION: "انتو فاتحين يوم الجمعة؟"' });
  });

  it('says not answerable without asking the model when nothing was found', async () => {
    const fetchFn = vi.fn();
    expect(await createOllamaAnswerabilityCheck({ url: 'http://x', model: 'm', fetchFn })('x', [])).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('throws on an HTTP error or a malformed answer', async () => {
    const failing = createOllamaAnswerabilityCheck({ url: 'http://x', model: 'm', fetchFn: vi.fn(async () => new Response('', { status: 500 })) });
    await expect(failing('q', sources)).rejects.toThrow(/500/);
    const malformed = createOllamaAnswerabilityCheck({
      url: 'http://x',
      model: 'm',
      fetchFn: vi.fn(async () => new Response(JSON.stringify({ message: { content: '{"ok":1}' } }))),
    });
    await expect(malformed('q', sources)).rejects.toThrow();
  });

  it('tells the model that something similar is not enough', () => {
    expect(ANSWERABILITY_PROMPT).toContain('A related or similar thing is not enough.');
    expect(ANSWERABILITY_PROMPT).toContain('{{SOURCES}}');
  });

  it('stops when the customer leaves', async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      await new Promise((_, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted'))));
      return reply(true);
    });
    const controller = new AbortController();
    const pending = createOllamaAnswerabilityCheck({ url: 'http://x', model: 'm', fetchFn: fetchFn as typeof fetch })('q', sources, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow('aborted');
  });
});
