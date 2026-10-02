import { openDatabase } from './db';
import type { Mock } from 'vitest';
import { ClassifyFn, TicketClassifier } from './ticket-classifier';
import { createTicketHandlers } from './ticket-handlers';
import { TicketRepository } from './ticket-repository';
import { Ticket } from './ticket-types';

const validBody = { name: 'منى', phone: '01001234567', description: 'عايزة أتبرع بهدوم' };

describe('ticket handlers', () => {
  let tickets: TicketRepository;
  let classify: Mock<ClassifyFn>;
  let handlers: ReturnType<typeof createTicketHandlers>;

  beforeEach(() => {
    tickets = new TicketRepository(openDatabase(':memory:'));
    classify = vi.fn<ClassifyFn>(async () => ({ category: 'donation', priority: 'low' }));
    handlers = createTicketHandlers(tickets, new TicketClassifier(tickets, classify));
  });

  it('creates a ticket, returns 201 with its id, and classifies it in the background', async () => {
    expect(handlers.create(validBody)).toEqual({ status: 201, body: { id: 1 } });
    await vi.waitFor(() => expect(tickets.get(1)?.classificationStatus).toBe('done'));
    expect(tickets.get(1)?.category).toBe('donation');
  });

  it('returns 400 for an invalid ticket', () => {
    const result = handlers.create({});
    expect(result.status).toBe(400);
    expect(result.body).toHaveProperty('error');
  });

  it('lists with filters', () => {
    handlers.create(validBody);
    handlers.create(validBody);
    tickets.update(1, { status: 'resolved' });
    const result = handlers.list({ status: 'new' });
    expect(result.status).toBe(200);
    expect((result.body as Ticket[]).map((t) => t.id)).toEqual([2]);
  });

  it('gets, updates and 404s', () => {
    handlers.create(validBody);
    expect(handlers.get('1')).toMatchObject({ status: 200, body: { id: 1 } });
    expect(handlers.get('99').status).toBe(404);
    expect(handlers.get('abc').status).toBe(404);
    expect(handlers.update('1', { status: 'resolved' })).toMatchObject({ status: 200, body: { status: 'resolved' } });
    expect(handlers.update('1', { status: 'closed' }).status).toBe(400);
    expect(handlers.update('99', { status: 'new' }).status).toBe(404);
  });

  it('reclassify resets to pending and returns 202', async () => {
    classify.mockRejectedValueOnce(new Error('Ollama down'));
    handlers.create(validBody);
    await vi.waitFor(() => expect(tickets.get(1)?.classificationStatus).toBe('failed'));

    const result = handlers.reclassify('1');
    expect(result).toMatchObject({ status: 202, body: { classificationStatus: 'pending' } });
    await vi.waitFor(() => expect(tickets.get(1)?.classificationStatus).toBe('done'));
    expect(handlers.reclassify('99').status).toBe(404);
  });
});
