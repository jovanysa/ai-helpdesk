import { openDatabase } from './db';
import { UnansweredRepository, isSmallTalk, normalizeQuestion } from './unanswered-questions';

describe('normalizeQuestion', () => {
  it.each([
    ['عندكم فرع في إسكندرية؟', 'عندكم فرع في اسكندريه'],
    ['  عندكم   فرع في اسكندريه ', 'عندكم فرع في اسكندريه'],
    ['أنتو فاتحين يوم الجمعة؟!', 'انتو فاتحين يوم الجمعه'],
    ['مُمكِن أتبرّع بالفيزا؟', 'ممكن اتبرع بالفيزا'],
    ['بتعلمـــوا الكبار؟', 'بتعلموا الكبار'],
    ['عندي سؤال، بخصوص الإيصال', 'عندي سؤال بخصوص الايصال'],
    ['Do you have a branch in Alexandria?', 'do you have a branch in alexandria'],
    ['الشكوى رقم ٣', 'الشكوي رقم 3'],
    ['عندي ۳ اطفال', 'عندي 3 اطفال'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeQuestion(input)).toBe(expected);
  });
});

describe('isSmallTalk', () => {
  it.each(['السلام عليكم', 'شكرا', 'شكرا جدا', 'شكرًا ليكم!', 'متشكر', 'تمام', 'مع السلامة', 'أهلا', 'thanks', 'Thank you so much!', 'ok bye', 'hi', 'Hello!', '👍', '???', '؟؟'])(
    '%s is small talk',
    (text) => expect(isSmallTalk(text)).toBe(true),
  );

  it.each(['شكرا، ممكن اتبرع بالفيزا؟', 'hi, do you have a branch in Alexandria?', 'السلام عليكم عايز اتطوع', 'تمام ازاي اقدم؟'])(
    '%s is a real question',
    (text) => expect(isSmallTalk(text)).toBe(false),
  );
});

describe('UnansweredRepository', () => {
  let clock: Date;
  let repo: UnansweredRepository;
  const tick = () => (clock = new Date(clock.getTime() + 60_000));

  beforeEach(() => {
    clock = new Date('2026-10-09T10:00:00Z');
    repo = new UnansweredRepository(openDatabase(':memory:'), () => clock);
  });

  it('groups the same question written differently and keeps the newest wording and reply', () => {
    repo.record('عندكم فرع في إسكندرية؟', 'رد 1', 'no_answer');
    tick();
    repo.record('  عندكم   فرع في اسكندريه ', 'رد 2', 'no_answer');
    tick();
    repo.record('عندكم فرع في اسكندرية', 'رد 3', 'no_answer');

    expect(repo.listOpen('no_answer')).toEqual([
      {
        key: 'عندكم فرع في اسكندريه',
        question: 'عندكم فرع في اسكندرية',
        count: 3,
        lastAskedAt: '2026-10-09T10:02:00.000Z',
        lastReply: 'رد 3',
      },
    ]);
  });

  it('orders by count, then by the most recent question', () => {
    repo.record('A?', 'r', 'no_answer');
    tick();
    repo.record('B?', 'r', 'no_answer');
    tick();
    repo.record('B', 'r', 'no_answer');
    tick();
    repo.record('C', 'r', 'no_answer');
    expect(repo.listOpen('no_answer').map((g) => g.key)).toEqual(['b', 'c', 'a']);
  });

  it('keeps the two reasons apart', () => {
    repo.record('مين كسب الماتش؟', 'refusal', 'off_topic');
    repo.record('فيه ركنة؟', 'مش عارف', 'no_answer');
    expect(repo.listOpen('off_topic').map((g) => g.question)).toEqual(['مين كسب الماتش؟']);
    expect(repo.listOpen('no_answer').map((g) => g.question)).toEqual(['فيه ركنة؟']);
  });

  it('resolving hides a group, and asking again starts a fresh count', () => {
    repo.record('فيه ركنة؟', 'r', 'no_answer');
    repo.record('فيه ركنة', 'r', 'no_answer');
    expect(repo.resolve('no_answer', 'فيه ركنه')).toBe(2);
    expect(repo.listOpen('no_answer')).toEqual([]);

    tick();
    repo.record('فيه ركنة؟', 'r', 'no_answer');
    expect(repo.listOpen('no_answer')).toMatchObject([{ key: 'فيه ركنه', count: 1 }]);
  });

  it('resolving only touches the given reason', () => {
    repo.record('x', 'r', 'no_answer');
    repo.record('x', 'r', 'off_topic');
    expect(repo.resolve('off_topic', 'x')).toBe(1);
    expect(repo.listOpen('no_answer')).toHaveLength(1);
  });

  it('does not record messages with no letters or digits', () => {
    repo.record('👍', 'r', 'no_answer');
    repo.record('؟؟', 'r', 'off_topic');
    expect(repo.listOpen('no_answer')).toEqual([]);
    expect(repo.listOpen('off_topic')).toEqual([]);
  });

  it('stores at most 500 characters of the question and the reply', () => {
    repo.record('س'.repeat(2000), 'ر'.repeat(2000), 'no_answer');
    const [group] = repo.listOpen('no_answer');
    expect(group.question).toHaveLength(500);
    expect(group.lastReply).toHaveLength(500);
  });

  it('forgets handled questions after 90 days, keeping open ones', () => {
    repo.record('قديمة', 'r', 'no_answer');
    repo.resolve('no_answer', 'قديمه');
    repo.record('مفتوحة', 'r', 'no_answer');
    clock = new Date(clock.getTime() + 91 * 24 * 60 * 60 * 1000);
    expect(repo.pruneResolved(90)).toBe(1);
    expect(repo.listOpen('no_answer').map((g) => g.question)).toEqual(['مفتوحة']);
  });
});
