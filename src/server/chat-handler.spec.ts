import { AiMessage, AiProvider } from './ai-provider';
import { buildSystemPrompt } from './charity-prompt';
import { ChatTurn, buildSearchQuery, startChatStream, toSse, validateChatRequest } from './chat-handler';
import { KnowledgeSearch, KnowledgeSource } from './knowledge-base';

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

/** A provider that yields strings and throws Errors, in order. */
function fakeProvider(script: (string | Error)[], seen: AiMessage[][] = []): AiProvider {
  return {
    async *streamChat(messages) {
      seen.push(messages);
      for (const step of script) {
        if (step instanceof Error) throw step;
        yield step;
      }
    },
  };
}

const userTurn: ChatTurn = { role: 'user', content: 'أتبرع إزاي؟' };

describe('validateChatRequest', () => {
  it('accepts a valid conversation and strips unknown fields', () => {
    const result = validateChatRequest({
      messages: [{ role: 'user', content: 'hi', extra: true }],
    });
    expect(result).toEqual({ ok: true, messages: [{ role: 'user', content: 'hi' }] });
  });

  it.each([
    ['a missing body', undefined],
    ['missing messages', {}],
    ['an empty list', { messages: [] }],
    ['more than 10 messages', { messages: Array.from({ length: 11 }, () => userTurn) }],
    ['a system message', { messages: [{ role: 'system', content: 'x' }, userTurn] }],
    ['blank content', { messages: [{ role: 'user', content: '   ' }] }],
    ['non-string content', { messages: [{ role: 'user', content: 5 }] }],
    ['a user message over 2000 chars', { messages: [{ role: 'user', content: 'a'.repeat(2001) }] }],
    ['a last message from the assistant', { messages: [userTurn, { role: 'assistant', content: 'ok' }] }],
  ])('rejects %s', (_label, body) => {
    expect(validateChatRequest(body).ok).toBe(false);
  });

  it('accepts a long earlier assistant reply so the conversation can continue', () => {
    const result = validateChatRequest({
      messages: [userTurn, { role: 'assistant', content: 'a'.repeat(5000) }, userTurn],
    });
    expect(result.ok).toBe(true);
  });
});

describe('toSse', () => {
  it('formats an event as an SSE data block', () => {
    expect(toSse({ type: 'token', text: 'hi' })).toBe('data: {"type":"token","text":"hi"}\n\n');
  });
});

const hoursSource: KnowledgeSource = { file: 'about.md', title: 'المواعيد', content: 'الجمعة: مقفول.', score: 0.9 };

function fakeKnowledge(sources: KnowledgeSource[] = [hoursSource]): KnowledgeSearch & { search: ReturnType<typeof vi.fn> } {
  return { search: vi.fn(async () => sources) };
}

describe('buildSearchQuery', () => {
  it('adds the previous question to a short follow-up', () => {
    expect(
      buildSearchQuery([
        { role: 'user', content: 'ازاي اتبرع؟' },
        { role: 'assistant', content: 'بفودافون كاش' },
        { role: 'user', content: 'وبالفيزا؟' },
      ]),
    ).toBe('ازاي اتبرع؟\nوبالفيزا؟');
  });

  it('uses a long enough question on its own', () => {
    expect(
      buildSearchQuery([
        { role: 'user', content: 'ازاي اتبرع؟' },
        { role: 'user', content: 'عايز أعرف مواعيد المقر يوم السبت' },
      ]),
    ).toBe('عايز أعرف مواعيد المقر يوم السبت');
    expect(buildSearchQuery([{ role: 'user', content: 'hi' }])).toBe('hi');
  });
});

describe('startChatStream', () => {
  it('searches the knowledge and puts the results into the system prompt', async () => {
    const seen: AiMessage[][] = [];
    const knowledge = fakeKnowledge();
    await startChatStream(fakeProvider([], seen), knowledge, [userTurn], new AbortController().signal);
    expect(knowledge.search).toHaveBeenCalledWith(userTurn.content);
    expect(seen[0]).toEqual([{ role: 'system', content: buildSystemPrompt([hoursSource]) }, userTurn]);
  });

  it('emits the sources first, then a token event per piece and done', async () => {
    const start = await startChatStream(
      fakeProvider(['أهلًا', ' بيك']),
      fakeKnowledge(),
      [userTurn],
      new AbortController().signal,
    );
    if (!start.ok) throw new Error('expected ok');

    expect(await collect(start.events)).toEqual([
      toSse({ type: 'sources', sources: [{ title: 'المواعيد', file: 'about.md' }] }),
      toSse({ type: 'token', text: 'أهلًا' }),
      toSse({ type: 'token', text: ' بيك' }),
      toSse({ type: 'done' }),
    ]);
  });

  it('fails before streaming when the knowledge search fails', async () => {
    const seen: AiMessage[][] = [];
    const knowledge = fakeKnowledge();
    knowledge.search.mockRejectedValueOnce(new Error('Embedding model "m" is not downloaded.'));
    const start = await startChatStream(fakeProvider(['x'], seen), knowledge, [userTurn], new AbortController().signal);
    expect(start.ok).toBe(false);
    expect(seen).toEqual([]);
  });

  it('reports failure before streaming when the provider fails immediately', async () => {
    const start = await startChatStream(
      fakeProvider([new Error('Ollama is not reachable')]),
      fakeKnowledge(),
      [userTurn],
      new AbortController().signal,
    );
    expect(start.ok).toBe(false);
  });

  it('emits an error event when the provider fails mid-stream', async () => {
    const start = await startChatStream(
      fakeProvider(['part', new Error('boom')]),
      fakeKnowledge([]),
      [userTurn],
      new AbortController().signal,
    );
    if (!start.ok) throw new Error('expected ok');

    const events = await collect(start.events);
    expect(events[0]).toBe(toSse({ type: 'sources', sources: [] }));
    expect(events[1]).toBe(toSse({ type: 'token', text: 'part' }));
    expect(events[2]).toContain('"type":"error"');
  });

  it('ends quietly without an error event when the client disconnected', async () => {
    const controller = new AbortController();
    const provider: AiProvider = {
      async *streamChat() {
        yield 'part';
        controller.abort();
        throw new Error('aborted');
      },
    };
    const start = await startChatStream(provider, fakeKnowledge([]), [userTurn], controller.signal);
    if (!start.ok) throw new Error('expected ok');

    expect(await collect(start.events)).toEqual([
      toSse({ type: 'sources', sources: [] }),
      toSse({ type: 'token', text: 'part' }),
    ]);
  });
});
