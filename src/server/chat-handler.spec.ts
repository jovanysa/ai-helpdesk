import { AiMessage, AiProvider } from './ai-provider';
import { REFUSAL_AR, REFUSAL_EN, buildSystemPrompt } from './charity-prompt';
import { ChatTurn, buildSearchQuery, startChatStream, toSse, validateChatRequest } from './chat-handler';
import { AnswerabilityCheck } from './answerability';
import { GapRecorder } from './gap-recorder';
import { TopicGate } from './topic-gate';
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

const allowAll = async () => true;

function fakeGaps() {
  return { recordOffTopic: vi.fn(), recordNoAnswer: vi.fn() } satisfies GapRecorder;
}

/** Positional helper for the older tests; gap recording is a no-op spy. */
function run(
  provider: AiProvider,
  knowledge: KnowledgeSearch,
  isAboutFoundation: TopicGate,
  turns: ChatTurn[],
  signal: AbortSignal,
  gaps: GapRecorder = fakeGaps(),
  isAnswerable: AnswerabilityCheck = async () => true,
) {
  return startChatStream({ provider, knowledge, isAboutFoundation, isAnswerable, gaps }, turns, signal);
}

const hoursSource: KnowledgeSource = { file: 'about.md', title: 'المواعيد', content: 'الجمعة: مقفول.', score: 0.7 };

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
    await run(fakeProvider([], seen), knowledge, allowAll, [userTurn], new AbortController().signal);
    expect(knowledge.search).toHaveBeenCalledWith(userTurn.content);
    expect(seen[0]).toEqual([{ role: 'system', content: buildSystemPrompt([hoursSource], 'ar') }, userTurn]);
  });

  it('emits the sources first, then a token event per piece and done', async () => {
    const start = await run(
      fakeProvider(['أهلًا', ' بيك']),
      fakeKnowledge(),
      allowAll,
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
    const start = await run(fakeProvider(['x'], seen), knowledge, allowAll, [userTurn], new AbortController().signal);
    expect(start.ok).toBe(false);
    expect(seen).toEqual([]);
  });

  it('reports failure before streaming when the provider fails immediately', async () => {
    const start = await run(
      fakeProvider([new Error('Ollama is not reachable')]),
      fakeKnowledge(),
      allowAll,
      [userTurn],
      new AbortController().signal,
    );
    expect(start.ok).toBe(false);
  });

  it('emits an error event when the provider fails mid-stream', async () => {
    const start = await run(
      fakeProvider(['part', new Error('boom')]),
      fakeKnowledge([]),
      allowAll,
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
    const start = await run(provider, fakeKnowledge([]), allowAll, [userTurn], controller.signal);
    if (!start.ok) throw new Error('expected ok');

    expect(await collect(start.events)).toEqual([
      toSse({ type: 'sources', sources: [] }),
      toSse({ type: 'token', text: 'part' }),
    ]);
  });

  it('answers off-topic questions with the refusal sentence without asking the model', async () => {
    const seen: AiMessage[][] = [];
    const gate = vi.fn(async () => false);
    const start = await run(fakeProvider(['Paris'], seen), fakeKnowledge(), gate, [userTurn], new AbortController().signal);
    if (!start.ok) throw new Error('expected ok');

    expect(await collect(start.events)).toEqual([
      toSse({ type: 'sources', sources: [] }),
      toSse({ type: 'token', text: REFUSAL_AR }),
      toSse({ type: 'done' }),
    ]);
    expect(seen).toEqual([]);
    expect(gate).toHaveBeenCalledWith(userTurn.content, undefined, expect.any(AbortSignal));
  });

  it('refuses in English for an English question', async () => {
    const start = await run(
      fakeProvider([]),
      fakeKnowledge(),
      async () => false,
      [{ role: 'user', content: 'What is the capital of France?' }],
      new AbortController().signal,
    );
    if (!start.ok) throw new Error('expected ok');
    expect(await collect(start.events)).toContain(toSse({ type: 'token', text: REFUSAL_EN }));
  });

  it('checks the current message, with the previous question as context', async () => {
    const gate = vi.fn(async () => true);
    await run(
      fakeProvider([]),
      fakeKnowledge(),
      gate,
      [
        { role: 'user', content: 'ازاي اتبرع؟' },
        { role: 'assistant', content: 'بفودافون كاش' },
        { role: 'user', content: 'وبالفيزا؟' },
      ],
      new AbortController().signal,
    );
    expect(gate).toHaveBeenCalledWith('وبالفيزا؟', 'ازاي اتبرع؟', expect.any(AbortSignal));
  });

  it('still answers when the topic check itself fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const start = await run(
      fakeProvider(['أهلًا']),
      fakeKnowledge(),
      async () => {
        throw new Error('timeout');
      },
      [userTurn],
      new AbortController().signal,
    );
    if (!start.ok) throw new Error('expected ok');
    expect(await collect(start.events)).toContain(toSse({ type: 'token', text: 'أهلًا' }));
    expect(console.error).toHaveBeenCalledWith('[chat] topic check failed:', 'timeout');
  });

  it('records an off-topic refusal with the current question', async () => {
    const gaps = fakeGaps();
    const start = await run(
      fakeProvider([]),
      fakeKnowledge(),
      async () => false,
      [{ role: 'user', content: 'مين كسب الماتش؟' }],
      new AbortController().signal,
      gaps,
    );
    if (!start.ok) throw new Error('expected ok');
    await collect(start.events);
    expect(gaps.recordOffTopic).toHaveBeenCalledWith('مين كسب الماتش؟', REFUSAL_AR);
      });

  it('answers with the refusal and records the question when the sources do not hold the answer', async () => {
    const seen: AiMessage[][] = [];
    const gaps = fakeGaps();
    const isAnswerable = vi.fn(async () => false);
    const start = await run(fakeProvider(['نعم، نقدم محو أمية'], seen), fakeKnowledge(), allowAll, [userTurn], new AbortController().signal, gaps, isAnswerable);
    if (!start.ok) throw new Error('expected ok');

    expect(await collect(start.events)).toEqual([
      toSse({ type: 'sources', sources: [] }),
      toSse({ type: 'token', text: REFUSAL_AR }),
      toSse({ type: 'done' }),
    ]);
    expect(seen).toEqual([]);
    expect(isAnswerable).toHaveBeenCalledWith(userTurn.content, [hoursSource], expect.any(AbortSignal));
    expect(gaps.recordNoAnswer).toHaveBeenCalledWith(userTurn.content, REFUSAL_AR);
  });

  it('checks a short follow-up together with the previous question but records the current one', async () => {
    const gaps = fakeGaps();
    const isAnswerable = vi.fn(async () => false);
    await run(
      fakeProvider([]),
      fakeKnowledge(),
      allowAll,
      [
        { role: 'user', content: 'ازاي اتبرع؟' },
        { role: 'assistant', content: 'بفودافون كاش' },
        { role: 'user', content: 'وبالفيزا؟' },
      ],
      new AbortController().signal,
      gaps,
      isAnswerable,
    );
    expect(isAnswerable).toHaveBeenCalledWith('ازاي اتبرع؟\nوبالفيزا؟', [hoursSource], expect.any(AbortSignal));
    expect(gaps.recordNoAnswer).toHaveBeenCalledWith('وبالفيزا؟', REFUSAL_AR);
  });

  it('answers normally and records nothing when the sources hold the answer', async () => {
    const gaps = fakeGaps();
    const start = await run(fakeProvider(['الجمعة مقفول.']), fakeKnowledge(), allowAll, [userTurn], new AbortController().signal, gaps);
    if (!start.ok) throw new Error('expected ok');
    expect(await collect(start.events)).toContain(toSse({ type: 'token', text: 'الجمعة مقفول.' }));
    expect(gaps.recordNoAnswer).not.toHaveBeenCalled();
    expect(gaps.recordOffTopic).not.toHaveBeenCalled();
  });

  it('refuses, without recording, when the answerability check itself fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const seen: AiMessage[][] = [];
    const gaps = fakeGaps();
    const start = await run(
      fakeProvider(['أهلًا'], seen),
      fakeKnowledge(),
      allowAll,
      [userTurn],
      new AbortController().signal,
      gaps,
      async () => {
        throw new Error('timeout');
      },
    );
    if (!start.ok) throw new Error('expected ok');
    expect(await collect(start.events)).toContain(toSse({ type: 'token', text: REFUSAL_AR }));
    expect(seen).toEqual([]);
    expect(gaps.recordNoAnswer).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('[chat] answerability check failed:', 'timeout');
  });

  it('does not check answerability for off-topic messages', async () => {
    const isAnswerable = vi.fn(async () => true);
    const start = await run(fakeProvider([]), fakeKnowledge(), async () => false, [userTurn], new AbortController().signal, fakeGaps(), isAnswerable);
    if (!start.ok) throw new Error('expected ok');
    await collect(start.events);
    expect(isAnswerable).not.toHaveBeenCalled();
  });

  it('answers a thank-you after an unanswered question without checking or recording it', async () => {
    const gaps = fakeGaps();
    const isAnswerable = vi.fn(async () => false);
    const start = await run(
      fakeProvider(['العفو!']),
      fakeKnowledge(),
      allowAll,
      [
        { role: 'user', content: 'بتدوا لبس مدرسة؟' },
        { role: 'assistant', content: REFUSAL_AR },
        { role: 'user', content: 'شكرا' },
      ],
      new AbortController().signal,
      gaps,
      isAnswerable,
    );
    if (!start.ok) throw new Error('expected ok');
    expect(await collect(start.events)).toContain(toSse({ type: 'token', text: 'العفو!' }));
    expect(isAnswerable).not.toHaveBeenCalled();
    expect(gaps.recordNoAnswer).not.toHaveBeenCalled();
  });

  it('trusts a very close knowledge match over an off-topic verdict', async () => {
    const gaps = fakeGaps();
    const isAnswerable = vi.fn(async () => true);
    const staffAnswer: KnowledgeSource = { file: 'staff-answers.md', title: 'عندكم واتساب؟', content: 'أيوه: 0100 000 0000', score: 0.84 };
    const start = await run(fakeProvider(['أيوه']), fakeKnowledge([staffAnswer]), async () => false, [{ role: 'user', content: 'عندكم واتساب؟' }], new AbortController().signal, gaps, isAnswerable);
    if (!start.ok) throw new Error('expected ok');
    expect(await collect(start.events)).toContain(toSse({ type: 'token', text: 'أيوه' }));
    expect(isAnswerable).toHaveBeenCalled();
    expect(gaps.recordOffTopic).not.toHaveBeenCalled();
  });

  it('keeps refusing off-topic messages whose best match is only loosely related', async () => {
    const gaps = fakeGaps();
    const loose: KnowledgeSource = { ...hoursSource, score: 0.69 };
    const start = await run(fakeProvider(['Paris']), fakeKnowledge([loose]), async () => false, [{ role: 'user', content: 'Capital of France?' }], new AbortController().signal, gaps);
    if (!start.ok) throw new Error('expected ok');
    expect(await collect(start.events)).toContain(toSse({ type: 'token', text: REFUSAL_EN }));
    expect(gaps.recordOffTopic).toHaveBeenCalled();
  });

  it('does not let a short off-topic follow-up borrow the previous question to pass the gate', async () => {
    const staffAnswer: KnowledgeSource = { file: 'staff-answers.md', title: 'مواعيد', content: 'من 9 لـ 5', score: 0.81 };
    const gaps = fakeGaps();
    const start = await run(
      fakeProvider(['Python is…']),
      fakeKnowledge([staffAnswer]),
      async () => false,
      [
        { role: 'user', content: 'What are your opening hours on Friday?' },
        { role: 'assistant', content: 'Closed.' },
        { role: 'user', content: 'and python?' },
      ],
      new AbortController().signal,
      gaps,
    );
    if (!start.ok) throw new Error('expected ok');
    expect(await collect(start.events)).toContain(toSse({ type: 'token', text: REFUSAL_EN }));
    expect(gaps.recordOffTopic).toHaveBeenCalled();
  });

  it('only lets a staff answer, not any section, outweigh the topic gate', async () => {
    const ordinary: KnowledgeSource = { file: 'about.md', title: 'المواعيد', content: 'الجمعة: مقفول.', score: 0.85 };
    const start = await run(fakeProvider(['x']), fakeKnowledge([ordinary]), async () => false, [userTurn], new AbortController().signal);
    if (!start.ok) throw new Error('expected ok');
    expect(await collect(start.events)).toContain(toSse({ type: 'token', text: REFUSAL_AR }));
  });

  it('stops quietly when the customer left during the checks', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const controller = new AbortController();
    const start = await run(
      fakeProvider(['x']),
      fakeKnowledge(),
      async () => {
        controller.abort();
        throw new Error('aborted');
      },
      [userTurn],
      controller.signal,
    );
    expect(start.ok).toBe(false);
    expect(error).not.toHaveBeenCalled();
  });

  it('sends no sources for small talk, so a greeting is not shown as read from the knowledge', async () => {
    const start = await run(fakeProvider(['العفو!']), fakeKnowledge(), allowAll, [{ role: 'user', content: 'شكرا' }], new AbortController().signal);
    if (!start.ok) throw new Error('expected ok');
    expect((await collect(start.events))[0]).toBe(toSse({ type: 'sources', sources: [] }));
  });
});
