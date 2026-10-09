import type { DatabaseSync } from 'node:sqlite';

export const GAP_REASONS = ['no_answer', 'off_topic'] as const;
export type GapReason = (typeof GAP_REASONS)[number];

export interface GapGroup {
  key: string;
  /** The newest wording customers used. */
  question: string;
  count: number;
  lastAskedAt: string;
  lastReply: string;
}

/**
 * Makes the same question typed differently compare equal: case, Arabic diacritics,
 * tatweel, hamza forms, ى/ي, ة/ه, punctuation and extra spaces.
 * (Grouping by embeddings was tried and could not tell "university fees" from "school fees".)
 */
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْٰ]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Words that make up greetings, thanks and goodbyes (after normalizeQuestion).
const SMALL_TALK_WORDS = new Set(
  (
    'السلام عليكم وعليكم سلام اهلا اهلين مرحبا صباح مساء الخير النور شكرا متشكر متشكره متشكرين الف ' +
    'تسلم تسلمي تسلموا جزاكم الله خيرا جدا ليكم ليك يا جماعه كتير تمام ماشي اوك مع السلامه باي ' +
    'hi hello hey thanks thank you so much very a lot thx ok okay bye goodbye good morning evening'
  ).split(' '),
);

/**
 * Greetings, thanks and emoji-only messages need no knowledge. Decided in code:
 * checked together with an unanswered previous question, the model called "thanks"
 * unanswerable too.
 */
export function isSmallTalk(text: string): boolean {
  const words = normalizeQuestion(text).split(' ').filter(Boolean);
  return words.every((word) => SMALL_TALK_WORDS.has(word));
}

const MAX_STORED_LENGTH = 500;

interface GroupRow {
  key: string;
  count: number;
  question: string;
  reply: string;
  created_at: string;
}

export class UnansweredRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Skips messages with no letters or digits; keeps at most 500 characters of each text. */
  record(question: string, reply: string, reason: GapReason): void {
    const key = normalizeQuestion(question);
    if (!key) return;
    this.db
      .prepare(
        'INSERT INTO unanswered_questions (question, question_key, reply, reason, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        question.slice(0, MAX_STORED_LENGTH),
        key.slice(0, MAX_STORED_LENGTH),
        reply.slice(0, MAX_STORED_LENGTH),
        reason,
        this.now().toISOString(),
      );
  }

  /** Open questions grouped by normalized text, most asked first. */
  listOpen(reason: GapReason): GapGroup[] {
    const rows = this.db
      .prepare(
        `SELECT g.key, g.count, u.question, u.reply, u.created_at
         FROM (
           SELECT question_key AS key, COUNT(*) AS count, MAX(id) AS last_id
           FROM unanswered_questions
           WHERE reason = ? AND resolved_at IS NULL
           GROUP BY question_key
         ) g
         JOIN unanswered_questions u ON u.id = g.last_id
         ORDER BY g.count DESC, u.id DESC`,
      )
      .all(reason) as unknown as GroupRow[];
    return rows.map((row) => ({
      key: row.key,
      question: row.question,
      count: row.count,
      lastAskedAt: row.created_at,
      lastReply: row.reply,
    }));
  }

  /** Marks every open row of a group as handled; returns how many rows changed. */
  resolve(reason: GapReason, key: string): number {
    const result = this.db
      .prepare(
        'UPDATE unanswered_questions SET resolved_at = ? WHERE reason = ? AND question_key = ? AND resolved_at IS NULL',
      )
      .run(this.now().toISOString(), reason, key);
    return Number(result.changes);
  }

  /** Customers may write personal details; handled questions are not kept forever. */
  pruneResolved(olderThanDays: number): number {
    const cutoff = new Date(this.now().getTime() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    const result = this.db
      .prepare('DELETE FROM unanswered_questions WHERE resolved_at IS NOT NULL AND resolved_at < ?')
      .run(cutoff);
    return Number(result.changes);
  }
}
