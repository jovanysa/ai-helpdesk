import { OLLAMA_KEEP_ALIVE } from './ai-provider';
import { KnowledgeSource } from './knowledge-base';
import { withTimeout } from './topic-gate';

/** True when the retrieved sources state the fact asked for (a written "no" counts). */
export type AnswerabilityCheck = (
  question: string,
  sources: Pick<KnowledgeSource, 'title' | 'content'>[],
  signal?: AbortSignal,
) => Promise<boolean>;

export interface OllamaAnswerabilityConfig {
  url: string;
  model: string;
  fetchFn?: typeof fetch;
}

export const ANSWERABILITY_PROMPT = `You check whether a charity's knowledge SOURCES contain the answer to a customer's QUESTION.
First copy into "quote" the one line from the SOURCES that answers the QUESTION, word for word. A line that says "no" or "not available" also answers. If the answer follows directly from a line (a minimum age, a day marked closed), copy that line.
If no line answers the specific thing asked about, set "quote" to "". A related or similar thing is not enough.
Then set "answerable" to true only if "quote" is not empty.

SOURCES:
{{SOURCES}}`;

// The quote comes first: copying the answering line before deciding made the 3B model
// more consistent, and lets the code check the line is really there.
const ANSWERABILITY_SCHEMA = {
  type: 'object',
  properties: { quote: { type: 'string' }, answerable: { type: 'boolean' } },
  required: ['quote', 'answerable'],
};

const MIN_QUOTE_LENGTH = 8;

// Ollama serves one request at a time here, so this may wait behind another customer's
// reply. The check fails closed (refuses), so give it room before giving up.
const CHECK_TIMEOUT_MS = 20_000;

/**
 * Decides before answering whether the sources hold the answer. The 3B model kept
 * stretching "teaching children" into "literacy classes"; asked only true/false it
 * never claimed support that was not there (15/15 in the spike, 6 of them unseen).
 */
export function createOllamaAnswerabilityCheck({
  url,
  model,
  fetchFn = fetch,
}: OllamaAnswerabilityConfig): AnswerabilityCheck {
  return async (question, sources, signal) => {
    if (sources.length === 0) return false;
    const listed = sources.map((source, i) => `[${i + 1}] ${source.title}\n${source.content}`).join('\n\n');
    const response = await fetchFn(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        keep_alive: OLLAMA_KEEP_ALIVE,
        format: ANSWERABILITY_SCHEMA,
        options: { temperature: 0, num_predict: 160 },
        messages: [
          { role: 'system', content: ANSWERABILITY_PROMPT.replace('{{SOURCES}}', listed) },
          { role: 'user', content: `QUESTION: "${question}"` },
        ],
      }),
      signal: withTimeout(signal, CHECK_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
    const data = (await response.json()) as { message?: { content?: string } };
    const { quote, answerable } = JSON.parse(data.message?.content ?? '') as Record<string, unknown>;
    if (typeof answerable !== 'boolean' || typeof quote !== 'string') {
      throw new Error(`Unexpected answerability check: ${data.message?.content}`);
    }
    // Both must agree: the model says yes, and the line it quoted really is in the sources.
    return answerable && quoteAppearsIn(quote, listed);
  };
}

/** True when the quote is in the text, ignoring bullets, spacing and punctuation. */
export function quoteAppearsIn(quote: string, text: string): boolean {
  const normalize = (value: string) => value.replace(/[\s\-–•*"“”'.,،؛;:؟?!()[\]]+/g, ' ').trim();
  const needle = normalize(quote);
  return needle.length >= MIN_QUOTE_LENGTH && normalize(text).includes(needle);
}
