import { Injectable, signal } from '@angular/core';
import { ChatMessage } from './message.model';
import { SseParser } from './sse-parser';

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_HISTORY = 10;
export const CHAT_ERROR_MESSAGE = 'خدمة المساعد غير متاحة حاليًا، حاول تاني.';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly _messages = signal<ChatMessage[]>([]);
  private readonly _isStreaming = signal(false);
  private readonly _error = signal<string | null>(null);
  private controller: AbortController | null = null;

  readonly messages = this._messages.asReadonly();
  readonly isStreaming = this._isStreaming.asReadonly();
  readonly error = this._error.asReadonly();

  async send(text: string): Promise<void> {
    const content = text.trim();
    if (!content || content.length > MAX_MESSAGE_LENGTH || this._isStreaming()) return;

    const history: ChatMessage[] = [...this._messages(), { role: 'user', content }];
    // The empty assistant message is the bubble the reply streams into.
    this._messages.set([...history, { role: 'assistant', content: '' }]);
    this._isStreaming.set(true);
    this._error.set(null);
    const controller = new AbortController();
    this.controller = controller;

    try {
      await this.streamReply(history.slice(-MAX_HISTORY), controller.signal);
    } catch {
      // Pressing Stop also lands here; that is not an error for the user.
      if (!controller.signal.aborted) this._error.set(CHAT_ERROR_MESSAGE);
    } finally {
      this.removeEmptyReply();
      this._isStreaming.set(false);
      this.controller = null;
    }
  }

  stop(): void {
    this.controller?.abort();
  }

  private async streamReply(messages: ChatMessage[], signal: AbortSignal): Promise<void> {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
      signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`Chat request failed with HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      // stream: true keeps a half-received Arabic character for the next chunk.
      for (const event of parser.push(decoder.decode(value, { stream: true }))) {
        if (event.type === 'token') this.appendToReply(event.text);
        else if (event.type === 'error') throw new Error(event.message);
        else return;
      }
    }
    throw new Error('The stream ended before the reply was complete');
  }

  private appendToReply(text: string): void {
    this._messages.update((messages) => {
      const reply = messages[messages.length - 1];
      return [...messages.slice(0, -1), { ...reply, content: reply.content + text }];
    });
  }

  private removeEmptyReply(): void {
    const last = this._messages().at(-1);
    // The server rejects blank turns, so a whitespace-only reply must go too.
    if (last?.role === 'assistant' && last.content.trim() === '') {
      this._messages.update((messages) => messages.slice(0, -1));
    }
  }
}
