import { REFUSAL_AR, REFUSAL_EN, buildSystemPrompt } from './charity-prompt';

describe('buildSystemPrompt', () => {
  it('lists the sources and both refusal sentences', () => {
    const prompt = buildSystemPrompt([
      { title: 'المواعيد', content: 'الجمعة: مقفول.' },
      { title: 'طرق التبرع', content: 'فودافون كاش' },
    ]);
    expect(prompt).toContain('[1] المواعيد\nالجمعة: مقفول.');
    expect(prompt).toContain('[2] طرق التبرع\nفودافون كاش');
    expect(prompt).toContain(REFUSAL_AR);
    expect(prompt).toContain(REFUSAL_EN);
    expect(prompt).not.toContain('000123456789');
  });

  it('says (none) when nothing was found', () => {
    expect(buildSystemPrompt([])).toContain('SOURCES:\n(none)');
  });

  it('uses the exact refusal sentences', () => {
    expect(REFUSAL_AR).toBe('معنديش المعلومة دي. أقدر أساعدك في أي سؤال عن جمعية الخير، أو كلّمنا على 0100 000 0000.');
    expect(REFUSAL_EN).toBe(
      "I don't have that information. I can help with questions about Al-Khair Foundation, or call us on 0100 000 0000.",
    );
  });
});
