import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from './db';
import { KnowledgeBase } from './knowledge-base';
import { KnowledgeChunk } from './knowledge-chunks';

const KEYWORDS = ['تبرع', 'تطوع', 'مواعيد'];

/** Fake embedder: one dimension per keyword, plus a constant so no vector is all zeros. */
function fakeEmbed() {
  const calls: string[][] = [];
  const embed = vi.fn(async (texts: string[]) => {
    calls.push(texts);
    return texts.map((t) => [...KEYWORDS.map((k) => (t.includes(k) ? 1 : 0)), 0.1]);
  });
  return { embed, calls };
}

const donate: KnowledgeChunk = { file: 'donations.md', title: 'طرق التبرع', content: 'تبرع بفودافون كاش' };
const volunteer: KnowledgeChunk = { file: 'volunteering.md', title: 'التطوع', content: 'تطوع في توزيع الوجبات' };
const hours: KnowledgeChunk = { file: 'about.md', title: 'المواعيد', content: 'مواعيد الشغل من الأحد للخميس' };

describe('KnowledgeBase', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = openDatabase(':memory:');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  const rows = () => db.prepare('SELECT title FROM knowledge_chunks ORDER BY title').all().map((r) => r['title']);

  it('indexes chunks and returns the closest ones first', async () => {
    const { embed } = fakeEmbed();
    const kb = new KnowledgeBase(db, embed, () => [donate, volunteer, hours], 'm');
    const results = await kb.search('عايز أتبرع', 2);
    expect(results.map((r) => r.title)).toEqual(['طرق التبرع', expect.any(String)]);
    expect(results[0]).toMatchObject({ file: 'donations.md', content: 'تبرع بفودافون كاش' });
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('returns three results by default', async () => {
    const kb = new KnowledgeBase(db, fakeEmbed().embed, () => [donate, volunteer, hours], 'm');
    expect(await kb.search('مواعيد')).toHaveLength(3);
  });

  it('embeds unchanged chunks only once across restarts', async () => {
    const first = fakeEmbed();
    await new KnowledgeBase(db, first.embed, () => [donate, volunteer], 'm').search('x');
    expect(first.calls[0]).toHaveLength(2);

    const second = fakeEmbed();
    await new KnowledgeBase(db, second.embed, () => [donate, volunteer], 'm').search('x');
    expect(second.calls).toEqual([['x']]);
  });

  it('re-embeds a changed chunk and forgets a removed one', async () => {
    await new KnowledgeBase(db, fakeEmbed().embed, () => [donate, volunteer], 'm').search('x');

    const changed = { ...donate, content: 'تبرع بالتحويل البنكي' };
    const second = fakeEmbed();
    const kb = new KnowledgeBase(db, second.embed, () => [changed], 'm');
    const results = await kb.search('تطوع');
    expect(second.calls[0]).toEqual(['طرق التبرع\nتبرع بالتحويل البنكي']);
    expect(rows()).toEqual(['طرق التبرع']);
    expect(results.map((r) => r.content)).toEqual(['تبرع بالتحويل البنكي']);
  });

  it('a model change re-embeds everything', async () => {
    await new KnowledgeBase(db, fakeEmbed().embed, () => [donate, volunteer], 'a').search('x');
    const second = fakeEmbed();
    await new KnowledgeBase(db, second.embed, () => [donate, volunteer], 'b').search('x');
    expect(second.calls[0]).toHaveLength(2);
    expect(rows()).toHaveLength(2);
  });

  it('retries indexing after a failure', async () => {
    const { embed } = fakeEmbed();
    embed.mockRejectedValueOnce(new Error('Ollama down'));
    const kb = new KnowledgeBase(db, embed, () => [donate], 'm');
    await expect(kb.search('تبرع')).rejects.toThrow('Ollama down');
    expect((await kb.search('تبرع')).map((r) => r.title)).toEqual(['طرق التبرع']);
  });

  it('returns no sources when there is no knowledge', async () => {
    const kb = new KnowledgeBase(db, fakeEmbed().embed, () => [], 'm');
    expect(await kb.search('x')).toEqual([]);
  });

  it('keeps working when two sections are exactly the same', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const copy = { ...donate, file: 'copy.md' };
    const { embed, calls } = fakeEmbed();
    const kb = new KnowledgeBase(db, embed, () => [donate, copy, volunteer], 'm');
    expect((await kb.search('تبرع', 1)).map((r) => r.title)).toEqual(['طرق التبرع']);
    expect(calls[0]).toHaveLength(2);
    expect(rows()).toHaveLength(2);
    expect(console.warn).toHaveBeenCalledWith('[knowledge] duplicate section "طرق التبرع" in copy.md; skipped');
  });

  it('keeps the vectors in memory instead of reading the table on every search', async () => {
    const kb = new KnowledgeBase(db, fakeEmbed().embed, () => [donate, volunteer], 'm');
    await kb.search('تبرع');
    const prepare = vi.spyOn(db, 'prepare');
    expect((await kb.search('تبرع')).map((r) => r.title)[0]).toBe('طرق التبرع');
    expect(prepare).not.toHaveBeenCalled();
  });

  it('warmUp builds the index and loads the embedding model without throwing', async () => {
    const { embed, calls } = fakeEmbed();
    await new KnowledgeBase(db, embed, () => [donate], 'm').warmUp();
    expect(rows()).toEqual(['طرق التبرع']);
    expect(calls).toHaveLength(2);

    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failing = new KnowledgeBase(openDatabase(':memory:'), vi.fn(async () => { throw new Error('down'); }), () => [donate], 'm');
    await expect(failing.warmUp()).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith('[knowledge] warm-up failed:', 'down');
  });
});
