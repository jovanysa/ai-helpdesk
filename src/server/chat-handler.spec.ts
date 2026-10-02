import { AiMessage, AiProvider } from './ai-provider';
import { CHARITY_SYSTEM_PROMPT } from './charity-prompt';
import { ChatTurn, startChatStream, toSse, validateChatRequest } from './chat-handler';

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

describe('startChatStream', () => {
  it('prepends the charity system prompt', async () => {
    const seen: AiMessage[][] = [];
    await startChatStream(fakeProvider([], seen), [userTurn], new AbortController().signal);
    expect(seen[0]).toEqual([{ role: 'system', content: CHARITY_SYSTEM_PROMPT }, userTurn]);
  });

  it('emits a token event per piece followed by done', async () => {
    const start = await startChatStream(
      fakeProvider(['أهلًا', ' بيك']),
      [userTurn],
      new AbortController().signal,
    );
    if (!start.ok) throw new Error('expected ok');

    expect(await collect(start.events)).toEqual([
      toSse({ type: 'token', text: 'أهلًا' }),
      toSse({ type: 'token', text: ' بيك' }),
      toSse({ type: 'done' }),
    ]);
  });

  it('reports failure before streaming when the provider fails immediately', async () => {
    const start = await startChatStream(
      fakeProvider([new Error('Ollama is not reachable')]),
      [userTurn],
      new AbortController().signal,
    );
    expect(start.ok).toBe(false);
  });

  it('emits an error event when the provider fails mid-stream', async () => {
    const start = await startChatStream(
      fakeProvider(['part', new Error('boom')]),
      [userTurn],
      new AbortController().signal,
    );
    if (!start.ok) throw new Error('expected ok');

    const events = await collect(start.events);
    expect(events[0]).toBe(toSse({ type: 'token', text: 'part' }));
    expect(events[1]).toContain('"type":"error"');
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
    const start = await startChatStream(provider, [userTurn], controller.signal);
    if (!start.ok) throw new Error('expected ok');

    expect(await collect(start.events)).toEqual([toSse({ type: 'token', text: 'part' })]);
  });
});
