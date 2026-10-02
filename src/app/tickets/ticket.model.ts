import { ChatMessage } from '../chat/message.model';

export type TicketStatus = 'new' | 'in_progress' | 'resolved';
export type TicketCategory = 'donation' | 'volunteering' | 'help_request' | 'complaint' | 'other';
export type TicketPriority = 'low' | 'medium' | 'high';
export type ClassificationStatus = 'pending' | 'done' | 'failed';

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
  transcript: ChatMessage[] | null;
}

export interface NewTicket {
  name: string;
  phone: string;
  description: string;
  transcript?: ChatMessage[];
}

export interface TicketPatch {
  status?: TicketStatus;
  category?: TicketCategory;
  priority?: TicketPriority;
}

export type TicketFilters = TicketPatch;

export const STATUS_LABELS: Record<TicketStatus, string> = {
  new: 'جديدة',
  in_progress: 'قيد المتابعة',
  resolved: 'تم الحل',
};

export const CATEGORY_LABELS: Record<TicketCategory, string> = {
  donation: 'تبرع',
  volunteering: 'تطوع',
  help_request: 'طلب مساعدة',
  complaint: 'شكوى',
  other: 'أخرى',
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'منخفضة',
  medium: 'متوسطة',
  high: 'عالية',
};

export const TICKET_STATUSES = Object.keys(STATUS_LABELS) as TicketStatus[];
export const TICKET_CATEGORIES = Object.keys(CATEGORY_LABELS) as TicketCategory[];
export const TICKET_PRIORITIES = Object.keys(PRIORITY_LABELS) as TicketPriority[];
