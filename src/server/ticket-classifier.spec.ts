import { openDatabase } from './db';
import {
  CLASSIFIER_PROMPT,
  TicketClassifier,
  createOllamaClassifier,
  parseClassification,
} from './ticket-classifier';
import { TicketRepository } from './ticket-repository';
import { TICKET_CATEGORIES, TranscriptMessage } from './ticket-types';

function ollamaReply(content: string): Response {
  return new Response(JSON.stringify({ message: { content } }));
}

describe('parseClassification', () => {
  it('parses a valid classification', () => {
    expect(parseClassification('{"category":"complaint","priority":"medium"}')).toEqual({
      category: 'complaint',
      priority: 'medium',
    });
  });

  it.each(['not json', '{"category":"spam","priority":"low"}', '{"category":"donation"}'])('rejects %s', (text) => {
    expect(() => parseClassification(text)).toThrow();
  });
});

describe('createOllamaClassifier', () => {
  it('sends a JSON-schema request with the chat customer messages', async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      ollamaReply('{"category":"donation","priority":"low"}'),
    );
    const classify = createOllamaClassifier({ url: 'http://ollama.test', model: 'm', fetchFn: fetchFn as typeof fetch });
    const transcript: TranscriptMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'أهلًا' },
    ];

    expect(await classify('عايز أتبرع', transcript)).toEqual({ category: 'donation', priority: 'low' });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('http://ollama.test/api/chat');
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({ model: 'm', stream: false, think: false, options: { temperature: 0 } });
    expect(body.format.properties.category.enum).toEqual([...TICKET_CATEGORIES]);
    expect(body.messages[0]).toEqual({ role: 'system', content: CLASSIFIER_PROMPT });
    expect(body.messages[1].content).toContain('عايز أتبرع');
    expect(body.messages[1].content).toContain('- hi');
    expect(body.messages[1].content).not.toContain('أهلًا');
  });

  it('throws when Ollama answers with an HTTP error', async () => {
    const classify = createOllamaClassifier({
      url: 'http://ollama.test',
      model: 'm',
      fetchFn: vi.fn(async () => new Response('boom', { status: 500 })),
    });
    await expect(classify('x', null)).rejects.toThrow(/500/);
  });
});

describe('TicketClassifier', () => {
  const ticket = { name: 'منى', phone: '01001234567', description: 'عايزة أتبرع', transcript: null };

  it('classifyInBackground stores the result', async () => {
    const tickets = new TicketRepository(openDatabase(':memory:'));
    tickets.create(ticket);
    await new TicketClassifier(tickets, async () => ({ category: 'donation', priority: 'low' })).classifyInBackground(1);
    expect(tickets.get(1)).toMatchObject({ category: 'donation', priority: 'low', classificationStatus: 'done' });
  });

  it('classifyInBackground marks failure and does not reject', async () => {
    const tickets = new TicketRepository(openDatabase(':memory:'));
    tickets.create(ticket);
    const classifier = new TicketClassifier(tickets, async () => {
      throw new Error('Ollama down');
    });
    await expect(classifier.classifyInBackground(1)).resolves.toBeUndefined();
    expect(tickets.get(1)?.classificationStatus).toBe('failed');
  });

  it('ignores a ticket that does not exist', async () => {
    const tickets = new TicketRepository(openDatabase(':memory:'));
    const classify = vi.fn();
    await new TicketClassifier(tickets, classify).classifyInBackground(42);
    expect(classify).not.toHaveBeenCalled();
  });

  it('classifyInBackground never rejects, even when the database write fails', async () => {
    const tickets = new TicketRepository(openDatabase(':memory:'));
    tickets.create(ticket);
    vi.spyOn(tickets, 'markClassificationFailed').mockImplementation(() => {
      throw new Error('database is locked');
    });
    const classifier = new TicketClassifier(tickets, async () => {
      throw new Error('Ollama down');
    });
    await expect(classifier.classifyInBackground(1)).resolves.toBeUndefined();
  });

  it('classifyInBackground never rejects when reading the ticket fails', async () => {
    const tickets = new TicketRepository(openDatabase(':memory:'));
    vi.spyOn(tickets, 'get').mockImplementation(() => {
      throw new Error('database is locked');
    });
    await expect(new TicketClassifier(tickets, vi.fn()).classifyInBackground(1)).resolves.toBeUndefined();
  });
});
