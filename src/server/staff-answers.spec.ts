import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseKnowledgeFile } from './knowledge-chunks';
import { STAFF_ANSWERS_FILE, appendStaffAnswer, validateStaffAnswer } from './staff-answers';

describe('validateStaffAnswer', () => {
  const valid = { reason: 'no_answer', key: 'فيه ركنه', title: ' فيه ركنة جنب المقر؟ ', answer: ' أيوه، فيه جراج قدام المقر. ' };

  it('trims and accepts a valid answer', () => {
    expect(validateStaffAnswer(valid)).toEqual({
      ok: true,
      value: { reason: 'no_answer', key: 'فيه ركنه', title: 'فيه ركنة جنب المقر؟', answer: 'أيوه، فيه جراج قدام المقر.' },
    });
  });

  it('removes characters that would break the markdown structure', () => {
    const result = validateStaffAnswer({ ...valid, title: '## فيه\nركنة؟', answer: 'سطر أول\n## مش عنوان\n#1 أولًا\n```' });
    expect(result).toMatchObject({ ok: true, value: { title: 'فيه ركنة؟', answer: 'سطر أول\n\\## مش عنوان\n#1 أولًا\n\\```' } });
    if (!result.ok) throw new Error('expected ok');
    expect(parseKnowledgeFile('x.md', `## t\n${result.value.answer}`)).toHaveLength(1);
  });

  it.each([
    ['a bad reason', { ...valid, reason: 'x' }],
    ['a missing key', { ...valid, key: '' }],
    ['a too-short title', { ...valid, title: 'ab' }],
    ['a too-long title', { ...valid, title: 'a'.repeat(151) }],
    ['a too-short answer', { ...valid, answer: 'ok' }],
    ['a too-long answer', { ...valid, answer: 'a'.repeat(2001) }],
    ['no body', undefined],
  ])('rejects %s', (_label, body) => {
    expect(validateStaffAnswer(body).ok).toBe(false);
  });
});

describe('appendStaffAnswer', () => {
  it('creates the file with a title and appends one section per answer', () => {
    const dir = mkdtempSync(join(tmpdir(), 'staff-answers-'));
    appendStaffAnswer(dir, 'فيه ركنة جنب المقر؟', 'أيوه، فيه جراج قدام المقر.');
    appendStaffAnswer(dir, 'Do you have WhatsApp?', 'Yes: 0100 000 0000.');

    const markdown = readFileSync(join(dir, STAFF_ANSWERS_FILE), 'utf8');
    expect(markdown.startsWith('# إجابات الموظفين / Staff answers\n')).toBe(true);
    expect(parseKnowledgeFile(STAFF_ANSWERS_FILE, markdown)).toEqual([
      { file: STAFF_ANSWERS_FILE, title: 'فيه ركنة جنب المقر؟', content: 'أيوه، فيه جراج قدام المقر.' },
      { file: STAFF_ANSWERS_FILE, title: 'Do you have WhatsApp?', content: 'Yes: 0100 000 0000.' },
    ]);
  });

  it('a stray code fence in one answer cannot swallow the answers after it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'staff-answers-'));
    const first = validateStaffAnswer({ reason: 'no_answer', key: 'k', title: 'سؤال 1', answer: 'إجابة\n```' });
    if (!first.ok) throw new Error('expected ok');
    appendStaffAnswer(dir, first.value.title, first.value.answer);
    appendStaffAnswer(dir, 'سؤال 2', 'إجابة تانية');
    const titles = parseKnowledgeFile(STAFF_ANSWERS_FILE, readFileSync(join(dir, STAFF_ANSWERS_FILE), 'utf8')).map((c) => c.title);
    expect(titles).toEqual(['سؤال 1', 'سؤال 2']);
  });
});

