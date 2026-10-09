import { openDatabase } from './db';
import { ANSWER_CHECK_PROMPT, GapLog, createOllamaAnswerCheck } from './gap-recorder';
import { UnansweredRepository } from './unanswered-questions';

const reply = (missing: boolean) =>
  new Response(JSON.stringify({ message: { content: JSON.stringify({ missing_information: missing }) } }));

describe('createOllamaAnswerCheck', () => {
  it('asks the model for a JSON yes/no about the question and reply', async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => reply(true));
    const check = createOllamaAnswerCheck({ url: 'http://ollama.test', model: 'm', fetchFn: fetchFn as typeof fetch });

    expect(await check('فيه ركنة؟', 'معنديش المعلومة دي')).toBe(true);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://ollama.test/api/chat');
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({ model: 'm', stream: false, think: false, options: { temperature: 0 } });
    expect(body.format).toEqual({
      type: 'object',
      properties: { missing_information: { type: 'boolean' } },
      required: ['missing_information'],
    });
    expect(body.messages).toEqual([
      { role: 'system', content: ANSWER_CHECK_PROMPT },
      { role: 'user', content: 'QUESTION: "فيه ركنة؟"\nREPLY: "معنديش المعلومة دي"' },
    ]);
  });

  it('throws on an HTTP error or a malformed answer', async () => {
    const failing = createOllamaAnswerCheck({ url: 'http://x', model: 'm', fetchFn: vi.fn(async () => new Response('', { status: 500 })) });
    await expect(failing('q', 'r')).rejects.toThrow(/500/);
    const malformed = createOllamaAnswerCheck({
      url: 'http://x',
      model: 'm',
      fetchFn: vi.fn(async () => new Response(JSON.stringify({ message: { content: '{"answered":true}' } }))),
    });
    await expect(malformed('q', 'r')).rejects.toThrow();
  });

  it('tells the model that a "no" is still an answer', () => {
    expect(ANSWER_CHECK_PROMPT).toContain('A reply that answers, even with "no"');
  });
});

describe('GapLog', () => {
  let repo: UnansweredRepository;

  beforeEach(() => {
    repo = new UnansweredRepository(openDatabase(':memory:'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('records a reply that says the information is missing', async () => {
    await new GapLog(repo, async () => true).reviewReply('فيه ركنة؟', 'معنديش المعلومة دي');
    expect(repo.listOpen('no_answer')).toMatchObject([{ question: 'فيه ركنة؟', lastReply: 'معنديش المعلومة دي', count: 1 }]);
  });

  it('does not record a reply that answered', async () => {
    await new GapLog(repo, async () => false).reviewReply('الجمعة؟', 'الجمعة مقفول.');
    expect(repo.listOpen('no_answer')).toEqual([]);
  });

  it('never rejects when the check fails', async () => {
    const log = new GapLog(repo, async () => {
      throw new Error('Ollama down');
    });
    await expect(log.reviewReply('q', 'r')).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith('[gaps] answer check failed:', 'Ollama down');
  });

  it('never throws when the database write fails', async () => {
    vi.spyOn(repo, 'record').mockImplementation(() => {
      throw new Error('database is locked');
    });
    const log = new GapLog(repo, async () => true);
    await expect(log.reviewReply('q', 'r')).resolves.toBeUndefined();
    expect(() => log.recordOffTopic('q', 'r')).not.toThrow();
    expect(console.error).toHaveBeenCalledWith('[gaps] could not record question:', 'database is locked');
  });

  it('records off-topic refusals under their own reason', () => {
    new GapLog(repo, async () => true).recordOffTopic('مين كسب الماتش؟', 'refusal');
    expect(repo.listOpen('off_topic')).toHaveLength(1);
    expect(repo.listOpen('no_answer')).toHaveLength(0);
  });
});
