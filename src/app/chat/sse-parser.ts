import { KnowledgeRef } from './message.model';

export type ChatStreamEvent =
  | { type: 'sources'; sources: KnowledgeRef[] }
  | { type: 'token'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

/** Turns Server-Sent Events text, arriving in arbitrary pieces, into parsed events. */
export class SseParser {
  private buffer = '';

  push(chunk: string): ChatStreamEvent[] {
    this.buffer += chunk;
    // Events end with a blank line; the last piece may be an unfinished event.
    const blocks = this.buffer.split('\n\n');
    this.buffer = blocks.pop() ?? '';

    const events: ChatStreamEvent[] = [];
    for (const block of blocks) {
      for (const line of block.split('\n')) {
        if (line.startsWith('data: ')) {
          events.push(JSON.parse(line.slice('data: '.length)) as ChatStreamEvent);
        }
      }
    }
    return events;
  }
}
