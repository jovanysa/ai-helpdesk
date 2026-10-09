import type { DatabaseSync } from 'node:sqlite';
import { Validation } from './ticket-validation';
import { UnansweredRepository } from './unanswered-questions';

export interface Feedback {
  question: string;
  reply: string;
  helpful: boolean;
}

export function validateFeedback(body: unknown): Validation<Feedback> {
  const { question, reply, helpful } = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof helpful !== 'boolean') return { ok: false, error: 'helpful must be true or false' };
  if (typeof question !== 'string' || !question.trim() || question.length > 2000) {
    return { ok: false, error: 'question must be 1 to 2000 characters' };
  }
  if (typeof reply !== 'string' || !reply.trim() || reply.length > 8000) {
    return { ok: false, error: 'reply must be 1 to 8000 characters' };
  }
  return { ok: true, value: { question: question.trim(), reply: reply.trim(), helpful } };
}

/**
 * Customer ratings of replies. Every rating counts toward the satisfaction figure;
 * a thumbs-down also lands on the staff page so someone can write a better answer.
 */
export class FeedbackRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly questions: UnansweredRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  record({ question, reply, helpful }: Feedback): void {
    this.db
      .prepare('INSERT INTO reply_feedback (helpful, created_at) VALUES (?, ?)')
      .run(helpful ? 1 : 0, this.now().toISOString());
    if (!helpful) this.questions.record(question, reply, 'disliked');
  }

  /** Ratings in the last `days` days. */
  summary(days: number): { helpful: number; total: number } {
    const since = new Date(this.now().getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    const row = this.db
      .prepare('SELECT COUNT(*) AS total, COALESCE(SUM(helpful), 0) AS helpful FROM reply_feedback WHERE created_at >= ?')
      .get(since);
    return { helpful: Number(row?.['helpful'] ?? 0), total: Number(row?.['total'] ?? 0) };
  }
}
