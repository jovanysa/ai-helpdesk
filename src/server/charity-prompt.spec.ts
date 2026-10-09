import { REFUSAL_AR, REFUSAL_EN, buildSystemPrompt, detectLanguage } from './charity-prompt';

describe('detectLanguage', () => {
  it('treats any Arabic letter as Arabic', () => {
    expect(detectLanguage('ازاي اتبرع؟')).toBe('ar');
    expect(detectLanguage('Vodafone Cash ينفع؟')).toBe('ar');
    expect(detectLanguage('How do I donate?')).toBe('en');
  });

  it('uses the earlier message for a message without letters, and Arabic by default', () => {
    expect(detectLanguage('👍', 'How do I donate?')).toBe('en');
    expect(detectLanguage('👍', 'ازاي اتبرع؟')).toBe('ar');
    expect(detectLanguage('123')).toBe('ar');
    expect(detectLanguage('ok', 'ازاي اتبرع؟')).toBe('en');
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

  it('tells the model one reply language', () => {
    expect(buildSystemPrompt(sources, 'ar')).toContain('Reply in Arabic script only.');
    expect(buildSystemPrompt(sources, 'en')).toContain('Reply in English only.');
  });

  it('asks for "I do not know" plus the phone number instead of a canned sentence to copy', () => {
    const prompt = buildSystemPrompt(sources, 'ar');
    expect(prompt).toContain("say briefly that you don't have that information and give the phone number 0100 000 0000. Do not guess.");
    expect(prompt).not.toContain(REFUSAL_AR);
    expect(prompt).not.toContain(REFUSAL_EN);
  });

  it('tells the model to list the help when asked what the foundation offers', () => {
    expect(buildSystemPrompt([], 'en')).toContain('When someone asks what the foundation offers, or describes a need');
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

});
