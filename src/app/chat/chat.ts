import { Component, ElementRef, afterRenderEffect, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChatService, MAX_MESSAGE_LENGTH } from './chat.service';
import { EscalationForm } from './escalation-form';
import { ChatMessage } from './message.model';

const NEAR_BOTTOM_PX = 120;

@Component({
  selector: 'app-chat',
  imports: [RouterLink, EscalationForm],
  templateUrl: './chat.html',
  styleUrl: './chat.scss',
})
export class Chat {
  protected readonly chat = inject(ChatService);
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

  constructor() {
    // Runs after Angular updates the DOM (browser only), so scrollHeight includes the new text.
    // Follow new text only when the reader is already near the bottom; never pull them
    // away from an earlier message they scrolled up to read.
    let wasNearBottom = true;
    afterRenderEffect({
      earlyRead: () => {
        this.chat.messages();
        const list = this.messageList().nativeElement;
        const near = wasNearBottom;
        wasNearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < NEAR_BOTTOM_PX;
        return near;
      },
      write: (near) => {
        const list = this.messageList().nativeElement;
        if (near()) list.scrollTop = list.scrollHeight;
      },
    });
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
