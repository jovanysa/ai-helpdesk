import { ApiResult } from './api-result';
import { TicketClassifier } from './ticket-classifier';
import { TicketRepository } from './ticket-repository';
import { parseFilters, parseTicketId, validateNewTicket, validateTicketPatch } from './ticket-validation';

const NOT_FOUND: ApiResult = { status: 404, body: { error: 'ticket not found' } };

export function createTicketHandlers(tickets: TicketRepository, classifier: TicketClassifier) {
  return {
    create(body: unknown): ApiResult {
      const parsed = validateNewTicket(body);
      if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
      const ticket = tickets.create(parsed.value);
      // The customer gets their ticket number now; the model takes a few seconds.
      void classifier.classifyInBackground(ticket.id);
      return { status: 201, body: { id: ticket.id } };
    },

    list(query: Record<string, unknown>): ApiResult {
      return { status: 200, body: tickets.list(parseFilters(query)) };
    },

    get(idParam: unknown): ApiResult {
      const id = parseTicketId(idParam);
      const ticket = id === undefined ? undefined : tickets.get(id);
      return ticket ? { status: 200, body: ticket } : NOT_FOUND;
    },

    update(idParam: unknown, body: unknown): ApiResult {
      const id = parseTicketId(idParam);
      if (id === undefined || !tickets.get(id)) return NOT_FOUND;
      const parsed = validateTicketPatch(body);
      if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
      return { status: 200, body: tickets.update(id, parsed.value) };
    },

    reclassify(idParam: unknown): ApiResult {
      const id = parseTicketId(idParam);
      if (id === undefined || !tickets.get(id)) return NOT_FOUND;
      tickets.markClassificationPending(id);
      void classifier.classifyInBackground(id);
      return { status: 202, body: tickets.get(id) };
    },
  };
}
