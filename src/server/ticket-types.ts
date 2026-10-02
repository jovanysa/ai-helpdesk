export const TICKET_STATUSES = ['new', 'in_progress', 'resolved'] as const;
export const TICKET_CATEGORIES = ['donation', 'volunteering', 'help_request', 'complaint', 'other'] as const;
export const TICKET_PRIORITIES = ['low', 'medium', 'high'] as const;
export const CLASSIFICATION_STATUSES = ['pending', 'done', 'failed'] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type ClassificationStatus = (typeof CLASSIFICATION_STATUSES)[number];

export function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

export interface TranscriptMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface NewTicket {
  name: string;
  phone: string;
  description: string;
  transcript: TranscriptMessage[] | null;
}

export interface TicketSummary {
  id: number;
  name: string;
  phone: string;
  description: string;
  source: 'chat' | 'form';
  status: TicketStatus;
  category: TicketCategory | null;
  priority: TicketPriority | null;
  classificationStatus: ClassificationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Ticket extends TicketSummary {
  transcript: TranscriptMessage[] | null;
}

export interface TicketPatch {
  status?: TicketStatus;
  category?: TicketCategory;
  priority?: TicketPriority;
}

export type TicketFilters = TicketPatch;

export interface Classification {
  category: TicketCategory;
  priority: TicketPriority;
}
