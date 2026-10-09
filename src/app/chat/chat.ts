import { Component, ElementRef, Injector, afterNextRender, afterRenderEffect, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChatService, MAX_MESSAGE_LENGTH } from './chat.service';
import { EscalationForm } from './escalation-form';
import { ChatMessage } from './message.model';
import { FeedbackApi } from './feedback-api';

const NEAR_BOTTOM_PX = 120;

@Component({
  selector: 'app-chat',
  imports: [RouterLink, EscalationForm],
  templateUrl: './chat.html',
  styleUrl: './chat.scss',
})
export class Chat {
  protected readonly chat = inject(ChatService);
  private readonly feedback = inject(FeedbackApi);
  private readonly injector = inject(Injector);
  protected readonly draft = signal('');
  protected readonly maxLength = MAX_MESSAGE_LENGTH;
  protected readonly suggestions = ['أتبرع إزاي؟', 'عايز أتطوع', 'محتاج مساعدة'];
  protected readonly escalating = signal(false);
  protected readonly escalatedTicketId = signal<number | null>(null);
  /** Offer a human once the assistant has answered at least once. */
  protected readonly canEscalate = computed(
    () => !this.chat.isStreaming() && this.chat.messages().some((m) => m.role === 'assistant' && m.content.trim()),
  );

  private readonly messageList = viewChild.required<ElementRef<HTMLElement>>('messageList');
  private followReply = true;

  constructor() {
    // Runs after Angular updates the DOM (browser only), so scrollHeight includes the new text.
    // Follow new text while the reader is at the bottom; once they scroll up to read,
    // leave them there. "At the bottom" is tracked from scroll events, so the list's
    // own growth never counts as the reader moving away.
    afterRenderEffect(() => {
      // Everything that changes the list's content or the space around it.
      this.chat.messages();
      this.chat.isStreaming();
      this.chat.error();
      this.escalating();
      this.escalatedTicketId();
      if (!this.followReply) return;
      const list = this.messageList().nativeElement;
      list.scrollTop = list.scrollHeight;
    });
  }

  /**
   * Answers written from the knowledge can be rated. Not refusals or small talk (no sources),
   * not a reply still being written, and not one that ended in an error.
   */
  protected canRate(message: ChatMessage, last: boolean): boolean {
    if (message.role !== 'assistant' || !message.sources?.length || !message.content.trim()) return false;
    return !(last && (this.chat.isStreaming() || this.chat.error()));
  }

  protected rate(index: number, helpful: boolean): void {
    const messages = this.chat.messages();
    const question = messages.slice(0, index).reverse().find((m) => m.role === 'user')?.content ?? '';
    this.chat.markRated(index);
    // The clicked button disappears; give keyboard and screen-reader users the thank-you instead.
    afterNextRender(() => document.getElementById(`rating-thanks-${index}`)?.focus(), { injector: this.injector });
    // A lost rating is not worth bothering the customer about.
    this.feedback.give(question, messages[index].content, helpful).subscribe({ error: () => undefined });
  }

  protected onListScroll(): void {
    const list = this.messageList().nativeElement;
    this.followReply = list.scrollHeight - list.scrollTop - list.clientHeight < NEAR_BOTTOM_PX;
  }

  protected onTicketCreated(id: number): void {
    this.escalatedTicketId.set(id);
    this.escalating.set(false);
  }

  protected sourceTitles(message: ChatMessage): string {
    // Section titles are bilingual ("طرق التبرع / How to donate"); the first part is enough here.
    return (message.sources ?? []).map((source) => source.title.split(' / ')[0]).join('، ');
  }

  protected onInput(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  protected onEnter(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    // Shift+Enter adds a new line; Enter while composing text belongs to the keyboard.
    if (keyboardEvent.shiftKey || keyboardEvent.isComposing) return;
    event.preventDefault();
    this.sendDraft();
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.sendDraft();
  }

  private sendDraft(): void {
    const text = this.draft();
    if (!text.trim() || this.chat.isStreaming()) return;
    this.draft.set('');
    void this.chat.send(text);
  }
}
