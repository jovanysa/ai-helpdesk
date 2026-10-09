import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadKnowledgeDir, parseKnowledgeFile } from './knowledge-chunks';

describe('knowledge chunks', () => {
  beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => undefined));

  it('splits on ## headings and ignores the file title', () => {
    expect(
      parseKnowledgeFile('donations.md', '# التبرع\nintro\n\n## طرق التبرع\n- فودافون كاش\n\n## الإيصال\n- خلال 3 أيام\n'),
    ).toEqual([
      { file: 'donations.md', title: 'طرق التبرع', content: '- فودافون كاش' },
      { file: 'donations.md', title: 'الإيصال', content: '- خلال 3 أيام' },
    ]);
  });

  it('returns no chunks for a file without ## headings', () => {
    expect(parseKnowledgeFile('x.md', '# only a title\ntext')).toEqual([]);
  });

  it('loads every .md file in a folder, sorted, and tolerates a missing folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'knowledge-'));
    writeFileSync(join(dir, 'b.md'), '## B\nsecond');
    writeFileSync(join(dir, 'a.md'), '## A\nfirst');
    writeFileSync(join(dir, 'notes.txt'), '## Ignored\nnot markdown');
    expect(loadKnowledgeDir(dir).map((c) => c.title)).toEqual(['A', 'B']);
    expect(loadKnowledgeDir(join(dir, 'does-not-exist'))).toEqual([]);
  });

  it('the real knowledge folder has chunks with both Arabic and English text', () => {
    const chunks = loadKnowledgeDir(join(process.cwd(), 'knowledge'));
    expect(chunks.length).toBeGreaterThanOrEqual(8);
    for (const chunk of chunks) {
      expect(chunk.content, chunk.title).toMatch(/[؀-ۿ]/);
      expect(chunk.content, chunk.title).toMatch(/[A-Za-z]{3}/);
    }
    expect(chunks.map((c) => c.content).join('\n')).toContain('الجمعة: مقفول.');
  });

  it('ignores ## lines inside a code block', () => {
    const md = '## مثال\nاكتب كده:\n```\n## ده مش عنوان\n```\nخلاص';
    expect(parseKnowledgeFile('x.md', md)).toEqual([
      { file: 'x.md', title: 'مثال', content: 'اكتب كده:\n```\n## ده مش عنوان\n```\nخلاص' },
    ]);
  });
});
