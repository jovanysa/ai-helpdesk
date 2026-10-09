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
answerable = true when the SOURCES explicitly state the fact asked for, or when the answer follows directly from a stated fact (a minimum age, a day marked closed, a rule). A "no" written in the SOURCES counts. Questions about what help exists, and people describing a need that a listed service covers, are answerable when the SOURCES list that help. Greetings and thanks are always answerable.
answerable = false when the specific thing asked about is not written in the SOURCES. A related or similar thing is not enough.

Examples (with other example sources):
SOURCES say "Sunday: closed." QUESTION "Are you open on Sunday?" -> {"answerable": true}
SOURCES say "Members must be at least 18." QUESTION "Can my 15 year old join?" -> {"answerable": true}
SOURCES say "We do not give scholarships." QUESTION "Do you give scholarships?" -> {"answerable": true}
SOURCES say "We give winter blankets." QUESTION "Do you give school uniforms?" -> {"answerable": false}
QUESTION "Hello!" -> {"answerable": true}

SOURCES:
{{SOURCES}}`;

const ANSWERABILITY_SCHEMA = {
  type: 'object',
  properties: { answerable: { type: 'boolean' } },
  required: ['answerable'],
};

// It fails open, so waiting longer than this only delays the customer.
const CHECK_TIMEOUT_MS = 10_000;

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
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: ANSWERABILITY_PROMPT.replace('{{SOURCES}}', listed) },
          { role: 'user', content: `QUESTION: "${question}"` },
        ],
      }),
      signal: withTimeout(signal, CHECK_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
    const data = (await response.json()) as { message?: { content?: string } };
    const answerable = (JSON.parse(data.message?.content ?? '') as Record<string, unknown>)['answerable'];
    if (typeof answerable !== 'boolean') throw new Error(`Unexpected answerability check: ${data.message?.content}`);
    return answerable;
  };
}
