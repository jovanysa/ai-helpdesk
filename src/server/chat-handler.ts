import { AiMessage, AiProvider } from './ai-provider';
import { CHARITY_SYSTEM_PROMPT } from './charity-prompt';

export const MAX_MESSAGES = 10;
export const MAX_USER_MESSAGE_LENGTH = 2000;
// AI replies can be longer than user messages; they come back to us as history.
export const MAX_ASSISTANT_MESSAGE_LENGTH = 8000;

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type ChatStreamEvent =
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

/**
 * Starts the AI reply and waits for its first piece, so a dead provider can still
 * be reported with a normal HTTP status before any SSE bytes are sent.
 */
export async function startChatStream(
  provider: AiProvider,
  turns: ChatTurn[],
  signal: AbortSignal,
): Promise<ChatStreamStart> {
  const messages: AiMessage[] = [{ role: 'system', content: CHARITY_SYSTEM_PROMPT }, ...turns];
  const iterator = provider.streamChat(messages, signal)[Symbol.asyncIterator]();

  let first: IteratorResult<string>;
  try {
    first = await iterator.next();
  } catch (error) {
    return { ok: false, error };
  }
  return { ok: true, events: sseEvents(first, iterator, signal) };
}

async function* sseEvents(
  first: IteratorResult<string>,
  iterator: AsyncIterator<string>,
  signal: AbortSignal,
): AsyncGenerator<string> {
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
