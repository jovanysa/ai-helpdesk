import { openDatabase } from './db';
import { FeedbackRepository, validateFeedback } from './feedback';
import { UnansweredRepository } from './unanswered-questions';

describe('validateFeedback', () => {
  it('accepts a question, a reply and a yes/no', () => {
    expect(validateFeedback({ question: ' ازاي اتبرع؟ ', reply: 'بفودافون كاش', helpful: false })).toEqual({
      ok: true,
      value: { question: 'ازاي اتبرع؟', reply: 'بفودافون كاش', helpful: false },
    });
  });

  it.each([
    ['no body', undefined],
    ['a missing reply', { question: 'q', helpful: true }],
    ['a non-boolean helpful', { question: 'q', reply: 'r', helpful: 'yes' }],
    ['a huge reply', { question: 'q', reply: 'a'.repeat(8001), helpful: true }],
  ])('rejects %s', (_label, body) => expect(validateFeedback(body).ok).toBe(false));
});

describe('FeedbackRepository', () => {
  let clock: Date;
  let gaps: UnansweredRepository;
  let feedback: FeedbackRepository;

  beforeEach(() => {
    clock = new Date('2026-10-09T10:00:00Z');
    const db = openDatabase(':memory:');
    gaps = new UnansweredRepository(db, () => clock);
    feedback = new FeedbackRepository(db, gaps, () => clock);
  });

  it('turns a thumbs-down into a question for staff, and a thumbs-up into nothing to do', () => {
    feedback.record({ question: 'ازاي اتبرع؟', reply: 'رد ضعيف', helpful: false });
    feedback.record({ question: 'المقر فين؟', reply: 'مدينة نصر', helpful: true });
    expect(gaps.listOpen('disliked')).toMatchObject([{ question: 'ازاي اتبرع؟', lastReply: 'رد ضعيف', count: 1 }]);
  });

  it('summarizes the last 30 days', () => {
    feedback.record({ question: 'q', reply: 'r', helpful: true });
    clock = new Date(clock.getTime() + 31 * 24 * 60 * 60 * 1000);
    feedback.record({ question: 'q', reply: 'r', helpful: true });
    feedback.record({ question: 'q', reply: 'r', helpful: true });
    feedback.record({ question: 'q', reply: 'r', helpful: false });
    expect(feedback.summary(30)).toEqual({ helpful: 2, total: 3 });
  });

  it('forgets ratings older than the given number of days', () => {
    feedback.record({ question: 'q', reply: 'r', helpful: true });
    clock = new Date(clock.getTime() + 91 * 24 * 60 * 60 * 1000);
    feedback.record({ question: 'q', reply: 'r', helpful: true });
    expect(feedback.pruneOlderThan(90)).toBe(1);
    expect(feedback.summary(365)).toEqual({ helpful: 1, total: 1 });
  });
});
