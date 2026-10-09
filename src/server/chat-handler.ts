import { AiMessage, AiProvider } from './ai-provider';
import { AnswerabilityCheck } from './answerability';
import { REFUSALS, buildSystemPrompt, detectLanguage } from './charity-prompt';
import { GapRecorder } from './gap-recorder';
import { KnowledgeSearch, KnowledgeSource } from './knowledge-base';
import { TopicGate } from './topic-gate';
import { isSmallTalk } from './unanswered-questions';

export const MAX_MESSAGES = 10;
export const MAX_USER_MESSAGE_LENGTH = 2000;
// AI replies can be longer than user messages; they come back to us as history.
export const MAX_ASSISTANT_MESSAGE_LENGTH = 8000;

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type ChatStreamEvent =
  | { type: 'sources'; sources: { title: string; file: string }[] }
  | { type: 'token'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export type ValidationResult = { ok: true; messages: ChatTurn[] } | { ok: false; error: string };

export type ChatStreamStart = { ok: true; events: AsyncIterable<string> } | { ok: false; error: unknown };

export function validateChatRequest(body: unknown): ValidationResult {
  const messages: unknown = (body as { messages?: unknown } | null | undefined)?.messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES) {
    return { ok: false, error: `messages must be an array of 1 to ${MAX_MESSAGES} items` };
  }
  if (!messages.every(isValidTurn)) {
    return {
      ok: false,
      error: 'each message needs role user|assistant and non-empty content within the length limit',
    };
  }
  if (messages[messages.length - 1].role !== 'user') {
    return { ok: false, error: 'the last message must be from the user' };
  }
  return { ok: true, messages: messages.map(({ role, content }) => ({ role, content })) };
}

function isValidTurn(value: unknown): value is ChatTurn {
  if (typeof value !== 'object' || value === null) return false;
  const { role, content } = value as Record<string, unknown>;
  if (typeof content !== 'string' || content.trim() === '') return false;
  if (role === 'user') return content.length <= MAX_USER_MESSAGE_LENGTH;
  if (role === 'assistant') return content.length <= MAX_ASSISTANT_MESSAGE_LENGTH;
  return false;
}

export function toSse(event: ChatStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// A follow-up like "وبالفيزا؟" means little on its own, so it is searched together with the question before it.
const SHORT_QUESTION = 20;

/** The text used to search the knowledge for the customer's latest question. */
export function buildSearchQuery(turns: ChatTurn[]): string {
  const questions = turns.filter((turn) => turn.role === 'user').map((turn) => turn.content);
  const last = questions.at(-1) ?? '';
  const previous = questions.at(-2);
  return last.trim().length < SHORT_QUESTION && previous ? `${previous}\n${last}` : last;
}

export interface ChatDeps {
  provider: AiProvider;
  knowledge: KnowledgeSearch;
  isAboutFoundation: TopicGate;
  isAnswerable: AnswerabilityCheck;
  gaps: GapRecorder;
}

/**
 * Checks the topic, finds the knowledge and checks it holds the answer, then starts
 * the AI reply and waits for its first piece, so a failure can still be reported
 * with a normal HTTP status before any SSE bytes are sent.
 */
export async function startChatStream(
  { provider, knowledge, isAboutFoundation, isAnswerable, gaps }: ChatDeps,
  turns: ChatTurn[],
  signal: AbortSignal,
): Promise<ChatStreamStart> {
  const query = buildSearchQuery(turns);
  const [current = '', previous] = turns
    .filter((turn) => turn.role === 'user')
    .map((turn) => turn.content)
    .reverse();
  const language = detectLanguage(current);

  let onTopic: boolean;
  let sources: KnowledgeSource[];
  try {
    [onTopic, sources] = await Promise.all([checkTopic(isAboutFoundation, current, previous), knowledge.search(query)]);
  } catch (error) {
    return { ok: false, error };
  }

  // Off-topic: the code answers with the fixed sentence; the model is not asked at all.
  if (!onTopic) {
    gaps.recordOffTopic(current, REFUSALS[language]);
    return { ok: true, events: refusalEvents(REFUSALS[language]) };
  }

  // The model is asked to answer only when the sources hold the answer; otherwise the
  // code says "I don't know" and records the question for staff to fill in.
  // Greetings and thanks need no knowledge, whatever the previous question was.
  if (!isSmallTalk(current) && !(await checkAnswerable(isAnswerable, query, sources))) {
    gaps.recordNoAnswer(current, REFUSALS[language]);
    return { ok: true, events: refusalEvents(REFUSALS[language]) };
  }

  const messages: AiMessage[] = [{ role: 'system', content: buildSystemPrompt(sources, language) }, ...turns];
  const iterator = provider.streamChat(messages, signal)[Symbol.asyncIterator]();

  let first: IteratorResult<string>;
  try {
    first = await iterator.next();
  } catch (error) {
    return { ok: false, error };
  }
  const sourcesEvent = toSse({ type: 'sources', sources: sources.map(({ title, file }) => ({ title, file })) });
  return { ok: true, events: sseEvents(sourcesEvent, first, iterator, signal) };
}

/** If the check itself fails, answer anyway: the prompt's refusal rule is the fallback. */
async function checkTopic(isAboutFoundation: TopicGate, current: string, previous?: string): Promise<boolean> {
  try {
    return await isAboutFoundation(current, previous);
  } catch (error) {
    console.error('[chat] topic check failed:', error instanceof Error ? error.message : error);
    return true;
  }
}

/** If the check itself fails, answer anyway: the prompt still forbids guessing. */
async function checkAnswerable(
  isAnswerable: AnswerabilityCheck,
  query: string,
  sources: KnowledgeSource[],
): Promise<boolean> {
  try {
    return await isAnswerable(query, sources);
  } catch (error) {
    console.error('[chat] answerability check failed:', error instanceof Error ? error.message : error);
    return true;
  }
}

async function* refusalEvents(refusal: string): AsyncGenerator<string> {
  yield toSse({ type: 'sources', sources: [] });
  yield toSse({ type: 'token', text: refusal });
  yield toSse({ type: 'done' });
}

async function* sseEvents(
  sourcesEvent: string,
  first: IteratorResult<string>,
  iterator: AsyncIterator<string>,
  signal: AbortSignal,
): AsyncGenerator<string> {
  yield sourcesEvent;
  try {
    for (let result = first; !result.done; result = await iterator.next()) {
      yield toSse({ type: 'token', text: result.value });
    }
    yield toSse({ type: 'done' });
  } catch (error) {
    // The browser went away; nobody is listening for an error.
    if (signal.aborted) return;
    console.error('[chat] AI stream failed:', error);
    yield toSse({ type: 'error', message: 'The AI stream failed.' });
  }
}
