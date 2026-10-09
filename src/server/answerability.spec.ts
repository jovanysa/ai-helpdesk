import { ANSWERABILITY_PROMPT, createOllamaAnswerabilityCheck, quoteAppearsIn } from './answerability';

const reply = (answerable: boolean, quote = 'الجمعة: مقفول.') =>
  new Response(JSON.stringify({ message: { content: JSON.stringify({ quote, answerable }) } }));
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
      properties: { quote: { type: 'string' }, answerable: { type: 'boolean' } },
      required: ['quote', 'answerable'],
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

  it('tells the model to quote the answering line first', () => {
    expect(ANSWERABILITY_PROMPT).toContain('First copy into "quote" the one line from the SOURCES that answers the QUESTION');
    expect(ANSWERABILITY_PROMPT).toContain('A related or similar thing is not enough.');
    expect(ANSWERABILITY_PROMPT).toContain('{{SOURCES}}');
  });

  it('is not answerable when the quoted line is not really in the sources', async () => {
    const check = createOllamaAnswerabilityCheck({
      url: 'http://x',
      model: 'm',
      fetchFn: vi.fn(async () => reply(true, 'نعم، بنقدم دروس محو أمية للكبار')),
    });
    expect(await check('عندكم محو أمية؟', sources)).toBe(false);
  });

  it('does not accept a section title as the quote', async () => {
    const check = createOllamaAnswerabilityCheck({ url: 'http://x', model: 'm', fetchFn: vi.fn(async () => reply(true, 'المواعيد')) });
    expect(await check('امتى؟', [{ title: 'المواعيد والمقر الرئيسي', content: 'الجمعة: مقفول.' }])).toBe(false);
  });

  it('is not answerable when the model says no, even with a real quote', async () => {
    const check = createOllamaAnswerabilityCheck({ url: 'http://x', model: 'm', fetchFn: vi.fn(async () => reply(false)) });
    expect(await check('q', sources)).toBe(false);
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

describe('quoteAppearsIn', () => {
  const text = '- الجمعة: مقفول.\n- Friday: closed.\n- من 9 الصبح لـ 5 العصر.\n- الجمعية بتقدّم كرتونة أكل.\n- التليفون: 0100 000 0000';
  it('tolerates the small differences a copying model makes', () => {
    expect(quoteAppearsIn('من 9 الصبح ل 5 العصر', text)).toBe(true); // tatweel
    expect(quoteAppearsIn('الجمعية بتقدم كرتونة أكل', text)).toBe(true); // shadda
    expect(quoteAppearsIn('التليفون: 01000000000', text)).toBe(true); // spacing in numbers
    expect(quoteAppearsIn('FRIDAY: CLOSED', text)).toBe(true); // case
  });
  it('finds a quote ignoring bullets, spacing and punctuation', () => {
    expect(quoteAppearsIn('الجمعة مقفول', text)).toBe(true);
    expect(quoteAppearsIn('- Friday:  closed', text)).toBe(true);
  });
  it('rejects invented or too short quotes', () => {
    expect(quoteAppearsIn('الجمعة مفتوح', text)).toBe(false);
    expect(quoteAppearsIn('', text)).toBe(false);
    expect(quoteAppearsIn('Fri', text)).toBe(false);
  });
});
