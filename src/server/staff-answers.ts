import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAP_REASONS, GapReason } from './unanswered-questions';
import { isOneOf } from './ticket-types';
import { Validation } from './ticket-validation';

/** Answers written from the staff page; a normal knowledge file, so it is in git and editable by hand. */
export const STAFF_ANSWERS_FILE = 'staff-answers.md';

export interface StaffAnswer {
  reason: GapReason;
  key: string;
  title: string;
  answer: string;
}

export function validateStaffAnswer(body: unknown): Validation<StaffAnswer> {
  const { reason, key, title, answer } = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  if (!isOneOf(GAP_REASONS, reason) || typeof key !== 'string' || !key.trim()) {
    return { ok: false, error: 'reason and key are required' };
  }
  // A title is one line, and no answer line may start a "#" heading: either would split the
  // section. A leading "#" in the answer is escaped (\#), so "#1 أولًا" keeps its text.
  const cleanTitle = typeof title === 'string' ? title.replace(/[#\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
  const cleanAnswer =
    typeof answer === 'string'
      ? answer
          .split(/\r?\n/)
          .map((line) => line.replace(/^(\s*)#/, '$1\\#'))
          .join('\n')
          .trim()
      : '';
  if (cleanTitle.length < 3 || cleanTitle.length > 150) return { ok: false, error: 'title must be 3 to 150 characters' };
  if (cleanAnswer.length < 5 || cleanAnswer.length > 2000) return { ok: false, error: 'answer must be 5 to 2000 characters' };
  return { ok: true, value: { reason, key, title: cleanTitle, answer: cleanAnswer } };
}

/** Adds "## title" + answer to the staff answers file, creating it if needed. */
export function appendStaffAnswer(dir: string, title: string, answer: string): void {
  const path = join(dir, STAFF_ANSWERS_FILE);
  if (!existsSync(path)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, '# إجابات الموظفين / Staff answers\n');
  }
  appendFileSync(path, `\n## ${title}\n${answer}\n`);
}
