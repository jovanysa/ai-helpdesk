import { TestBed } from '@angular/core/testing';
import { CHAT_ERROR_MESSAGE, ChatService } from './chat.service';

function sseResponse(chunks: (string | Uint8Array)[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } });
}

const token = (text: string) => `data: ${JSON.stringify({ type: 'token', text })}\n\n`;
const done = 'data: {"type":"done"}\n\n';

describe('ChatService', () => {
  let service: ChatService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    service = TestBed.inject(ChatService);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('appends streamed tokens to the assistant reply', async () => {
    fetchMock.mockResolvedValue(sseResponse([token('أهلًا'), token(' بيك') + done]));

    await service.send('  أتبرع إزاي؟ ');

    expect(service.messages()).toEqual([
      { role: 'user', content: 'أتبرع إزاي؟' },
      { role: 'assistant', content: 'أهلًا بيك' },
    ]);
    expect(service.isStreaming()).toBe(false);
    expect(service.error()).toBeNull();
  });

  it('posts the conversation without the empty reply placeholder', async () => {
    fetchMock.mockResolvedValue(sseResponse([done]));

    await service.send('hi');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/chat');
    expect(JSON.parse(init.body)).toEqual({ messages: [{ role: 'user', content: 'hi' }] });
  });

  it('sends at most the last 10 messages', async () => {
    fetchMock.mockImplementation(async () => sseResponse([token('ok') + done]));
    for (let i = 0; i < 6; i++) await service.send(`q${i}`);

    const lastBody = JSON.parse(fetchMock.mock.calls[5][1].body);
    expect(lastBody.messages).toHaveLength(10);
    expect(lastBody.messages.at(-1)).toEqual({ role: 'user', content: 'q5' });
  });

  it('keeps Arabic characters intact when their bytes are split across chunks', async () => {
    const bytes = new TextEncoder().encode(token('أهلًا') + done);
    // Byte 31 is the middle of "أ" (the 30 bytes before it are ASCII).
    fetchMock.mockResolvedValue(sseResponse([bytes.slice(0, 31), bytes.slice(31)]));

    await service.send('hi');

    expect(service.messages()[1].content).toBe('أهلًا');
  });

  it('shows an error and removes the empty reply when the server is unavailable', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":"AI service unavailable"}', { status: 503 }));

    await service.send('hi');

    expect(service.error()).toBe(CHAT_ERROR_MESSAGE);
    expect(service.messages()).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('keeps the partial reply and shows an error when the stream ends without done', async () => {
    fetchMock.mockResolvedValue(sseResponse([token('نص')]));

    await service.send('hi');

    expect(service.messages()[1]).toEqual({ role: 'assistant', content: 'نص' });
    expect(service.error()).toBe(CHAT_ERROR_MESSAGE);
  });

  it('shows an error when the server sends an error event', async () => {
    fetchMock.mockResolvedValue(sseResponse([token('a') + 'data: {"type":"error","message":"x"}\n\n']));

    await service.send('hi');

    expect(service.error()).toBe(CHAT_ERROR_MESSAGE);
  });

  it('stops quietly before the first token and can send again afterwards', async () => {
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    const pending = service.send('hi');
    service.stop();
    await pending;

    expect(service.error()).toBeNull();
    expect(service.isStreaming()).toBe(false);
    expect(service.messages()).toEqual([{ role: 'user', content: 'hi' }]);

    fetchMock.mockResolvedValueOnce(sseResponse([token('ok') + done]));
    await service.send('again');
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.messages.every((m: { content: string }) => m.content.length > 0)).toBe(true);
  });

  it('drops a whitespace-only reply after Stop so the next request stays valid', async () => {
    fetchMock.mockImplementationOnce(
      async (_url: string, init: RequestInit) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(token('\n')));
              init.signal!.addEventListener('abort', () => controller.error(new Error('aborted')));
            },
          }),
        ),
    );

    const pending = service.send('hi');
    await vi.waitFor(() => expect(service.messages()[1]?.content).toBe('\n'));
    service.stop();
    await pending;

    expect(service.error()).toBeNull();
    expect(service.messages()).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('ignores blank messages and messages sent while a reply is streaming', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (finish = resolve)));

    await service.send('   ');
    expect(fetchMock).not.toHaveBeenCalled();

    const first = service.send('one');
    await service.send('two');
    finish(sseResponse([done]));
    await first;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
