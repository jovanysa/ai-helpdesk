import {
  NewTicket,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TicketFilters,
  TicketPatch,
  TranscriptMessage,
  isOneOf,
} from './ticket-types';

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

const MAX_TRANSCRIPT_MESSAGES = 20;
const MAX_TRANSCRIPT_CONTENT = 8000;

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits to ASCII, spaces removed. */
export function normalizePhone(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s/g, '');
}

export function validateNewTicket(body: unknown): Validation<NewTicket> {
  const input = asRecord(body);
  const name = trimmed(input['name']);
  if (name.length < 2 || name.length > 100) return fail('name must be 2 to 100 characters');

  const phone = normalizePhone(typeof input['phone'] === 'string' ? input['phone'] : '');
  if (!/^\+?[0-9]{8,15}$/.test(phone)) return fail('phone must be 8 to 15 digits');

  const description = trimmed(input['description']);
  if (description.length < 5 || description.length > 2000) {
    return fail('description must be 5 to 2000 characters');
  }

  const transcript = input['transcript'];
  if (transcript === undefined || transcript === null) {
    return { ok: true, value: { name, phone, description, transcript: null } };
  }
  if (
    !Array.isArray(transcript) ||
    transcript.length < 1 ||
    transcript.length > MAX_TRANSCRIPT_MESSAGES ||
    !transcript.every(isTranscriptMessage)
  ) {
    return fail(`transcript must be 1 to ${MAX_TRANSCRIPT_MESSAGES} chat messages`);
  }
  return {
    ok: true,
    value: { name, phone, description, transcript: transcript.map(({ role, content }) => ({ role, content })) },
  };
}

export function validateTicketPatch(body: unknown): Validation<TicketPatch> {
  const input = asRecord(body);
  const patch: TicketPatch = {};
  const { status, category, priority } = input;

  if (status !== undefined) {
    if (!isOneOf(TICKET_STATUSES, status)) return fail('invalid status');
    patch.status = status;
  }
  if (category !== undefined) {
    if (!isOneOf(TICKET_CATEGORIES, category)) return fail('invalid category');
    patch.category = category;
  }
  if (priority !== undefined) {
    if (!isOneOf(TICKET_PRIORITIES, priority)) return fail('invalid priority');
    patch.priority = priority;
  }
  if (Object.keys(patch).length === 0) return fail('nothing to update');
  return { ok: true, value: patch };
}

/** Unknown filter values are dropped rather than rejected. */
export function parseFilters(query: Record<string, unknown>): TicketFilters {
  const filters: TicketFilters = {};
  if (isOneOf(TICKET_STATUSES, query['status'])) filters.status = query['status'];
  if (isOneOf(TICKET_CATEGORIES, query['category'])) filters.category = query['category'];
  if (isOneOf(TICKET_PRIORITIES, query['priority'])) filters.priority = query['priority'];
  return filters;
}

export function parseTicketId(value: unknown): number | undefined {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

function isTranscriptMessage(value: unknown): value is TranscriptMessage {
  const { role, content } = asRecord(value);
  return (
    (role === 'user' || role === 'assistant') &&
    typeof content === 'string' &&
    content.length <= MAX_TRANSCRIPT_CONTENT
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}
