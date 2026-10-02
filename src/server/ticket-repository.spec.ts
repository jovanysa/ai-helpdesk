import { openDatabase } from './db';
import { TicketRepository } from './ticket-repository';
import { NewTicket } from './ticket-types';

const formTicket: NewTicket = { name: 'منى', phone: '01001234567', description: 'عايزة أتطوع', transcript: null };
const chatTicket: NewTicket = {
  ...formTicket,
  transcript: [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'أهلًا' },
  ],
};

describe('TicketRepository', () => {
  let clock: Date;
  let tickets: TicketRepository;

  beforeEach(() => {
    clock = new Date('2026-10-02T10:00:00Z');
    tickets = new TicketRepository(openDatabase(':memory:'), () => clock);
  });

  it('creates a form ticket with defaults', () => {
    expect(tickets.create(formTicket)).toEqual({
      id: 1,
      name: 'منى',
      phone: '01001234567',
      description: 'عايزة أتطوع',
      source: 'form',
      status: 'new',
      category: null,
      priority: null,
      classificationStatus: 'pending',
      transcript: null,
      createdAt: '2026-10-02T10:00:00.000Z',
      updatedAt: '2026-10-02T10:00:00.000Z',
    });
  });

  it('stores and returns the chat transcript', () => {
    expect(tickets.create(chatTicket)).toMatchObject({ source: 'chat', transcript: chatTicket.transcript });
  });

  it('lists newest first without transcripts and filters by status, category and priority', () => {
    tickets.create(formTicket);
    tickets.create(chatTicket);
    tickets.create(formTicket);
    tickets.update(2, { status: 'resolved', category: 'complaint', priority: 'high' });

    const all = tickets.list();
    expect(all.map((t) => t.id)).toEqual([3, 2, 1]);
    expect('transcript' in all[1]).toBe(false);
    expect(tickets.list({ status: 'resolved' }).map((t) => t.id)).toEqual([2]);
    expect(tickets.list({ category: 'complaint', priority: 'high' }).map((t) => t.id)).toEqual([2]);
    expect(tickets.list({ priority: 'low' })).toEqual([]);
  });

  it('update changes the status and bumps updatedAt', () => {
    tickets.create(formTicket);
    clock = new Date('2026-10-02T11:00:00Z');
    expect(tickets.update(1, { status: 'in_progress' })).toMatchObject({
      status: 'in_progress',
      createdAt: '2026-10-02T10:00:00.000Z',
      updatedAt: '2026-10-02T11:00:00.000Z',
    });
  });

  it('applies an AI classification to a pending ticket', () => {
    tickets.create(formTicket);
    tickets.applyClassification(1, { category: 'donation', priority: 'low' });
    expect(tickets.get(1)).toMatchObject({ category: 'donation', priority: 'low', classificationStatus: 'done' });
  });

  it('does not let a late AI result overwrite a staff choice', () => {
    tickets.create(formTicket);
    tickets.update(1, { category: 'complaint' });
    tickets.applyClassification(1, { category: 'donation', priority: 'low' });
    expect(tickets.get(1)).toMatchObject({ category: 'complaint', priority: null, classificationStatus: 'done' });
  });

  it('marks failure only while pending, and pending can be set again for a retry', () => {
    tickets.create(formTicket);
    tickets.markClassificationFailed(1);
    expect(tickets.get(1)?.classificationStatus).toBe('failed');
    tickets.markClassificationPending(1);
    expect(tickets.get(1)?.classificationStatus).toBe('pending');
    tickets.applyClassification(1, { category: 'other', priority: 'low' });
    tickets.markClassificationFailed(1);
    expect(tickets.get(1)?.classificationStatus).toBe('done');
  });

  it('returns undefined when updating or getting a missing ticket', () => {
    expect(tickets.get(99)).toBeUndefined();
    expect(tickets.update(99, { status: 'resolved' })).toBeUndefined();
  });
});
