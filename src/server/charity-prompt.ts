import { KnowledgeSource } from './knowledge-base';

export type ReplyLanguage = 'ar' | 'en';

export const REFUSAL_AR =
  'معنديش المعلومة دي. أقدر أساعدك في أي سؤال عن جمعية الخير، أو كلّمنا على 0100 000 0000.';
export const REFUSAL_EN =
  "I don't have that information. I can help with questions about Al-Khair Foundation, or call us on 0100 000 0000.";

export const REFUSALS: Record<ReplyLanguage, string> = { ar: REFUSAL_AR, en: REFUSAL_EN };

/**
 * Any Arabic letter means an Arabic reply; decided in code because the model often got it wrong.
 * A message without letters (👍, "123") follows the customer's previous message, else Arabic.
 */
export function detectLanguage(text: string, previous?: string): ReplyLanguage {
  if (!/\p{L}/u.test(text)) return previous ? detectLanguage(previous) : 'ar';
  return /[\u0600-\u06FF]/.test(text) ? 'ar' : 'en';
}

const LANGUAGE_RULE: Record<ReplyLanguage, string> = {
  ar: 'Reply in Arabic script only. Do not use any other language or Latin letters.',
  en: 'Reply in English only.',
};

/**
 * Instructions for the answering model, built for each message from the retrieved
 * knowledge. The rules come after the sources: small models follow what they read last.
 * Off-topic refusals are done in code (topic gate); here "I don't know" is deliberately
 * not a ready-made sentence, because a small model copied it even when the answer was there.
 */
export function buildSystemPrompt(
  sources: Pick<KnowledgeSource, 'title' | 'content'>[],
  language: ReplyLanguage,
): string {
  const listed = sources.length
    ? sources.map((source, i) => `[${i + 1}] ${source.title}\n${source.content}`).join('\n\n')
    : '(none)';

  return `You are the customer support assistant of "جمعية الخير" (Al-Khair Foundation), a charity in Cairo, Egypt.

SOURCES:
${listed}

RULES
1. ${LANGUAGE_RULE[language]}
2. Answer from the SOURCES above. Never use outside knowledge and never invent numbers, dates, places or names.
3. When someone asks what the foundation offers, or describes a need, list the help from the SOURCES and how to request it.
4. If the SOURCES do not contain the specific fact asked for, say briefly that you don't have that information and give the phone number 0100 000 0000. Do not guess.
5. If the message only greets or thanks you, reply with a short greeting and ask how you can help.
6. Keep answers short and clear. Use bullet points when listing things.
7. Never ask for bank card numbers, passwords or verification codes.`;
}
