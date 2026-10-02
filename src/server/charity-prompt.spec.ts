import { REFUSAL_AR, REFUSAL_EN, buildSystemPrompt, detectLanguage } from './charity-prompt';

describe('detectLanguage', () => {
  it('treats any Arabic letter as Arabic', () => {
    expect(detectLanguage('ازاي اتبرع؟')).toBe('ar');
    expect(detectLanguage('Vodafone Cash ينفع؟')).toBe('ar');
    expect(detectLanguage('How do I donate?')).toBe('en');
  });
});

describe('buildSystemPrompt', () => {
  const sources = [
    { title: 'المواعيد', content: 'الجمعة: مقفول.' },
    { title: 'طرق التبرع', content: 'فودافون كاش' },
  ];

  it('lists the sources without any hard-coded facts', () => {
    const prompt = buildSystemPrompt(sources, 'ar');
    expect(prompt).toContain('[1] المواعيد\nالجمعة: مقفول.');
    expect(prompt).toContain('[2] طرق التبرع\nفودافون كاش');
    expect(prompt).not.toContain('000123456789');
  });

  it('tells the model one reply language and the matching refusal', () => {
    const arabic = buildSystemPrompt(sources, 'ar');
    expect(arabic).toContain('Reply in Arabic script only.');
    expect(arabic).toContain(REFUSAL_AR);
    expect(arabic).not.toContain(REFUSAL_EN);

    const english = buildSystemPrompt(sources, 'en');
    expect(english).toContain('Reply in English only.');
    expect(english).toContain(REFUSAL_EN);
    expect(english).not.toContain(REFUSAL_AR);
  });

  it('puts the rules after the sources', () => {
    const prompt = buildSystemPrompt(sources, 'en');
    expect(prompt.indexOf('SOURCES:')).toBeLessThan(prompt.indexOf('RULES'));
  });

  it('says (none) when nothing was found', () => {
    expect(buildSystemPrompt([], 'en')).toContain('SOURCES:\n(none)');
  });

  it('uses the exact refusal sentences', () => {
    expect(REFUSAL_AR).toBe('معنديش المعلومة دي. أقدر أساعدك في أي سؤال عن جمعية الخير، أو كلّمنا على 0100 000 0000.');
    expect(REFUSAL_EN).toBe(
      "I don't have that information. I can help with questions about Al-Khair Foundation, or call us on 0100 000 0000.",
    );
  });

  it('lets the model answer greetings and thanks', () => {
    expect(buildSystemPrompt([], 'ar')).toContain('If the message only greets or thanks you');
  });

  it('tells the model to explain how to get help when someone describes a need', () => {
    expect(buildSystemPrompt([], 'en')).toContain('describes a need the foundation helps with');
  });
});
