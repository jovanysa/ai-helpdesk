import { Component, ElementRef, afterRenderEffect, inject, signal, viewChild } from '@angular/core';
import { ChatService, MAX_MESSAGE_LENGTH } from './chat.service';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.html',
  styleUrl: './chat.scss',
})
export class Chat {
  protected readonly chat = inject(ChatService);
  protected readonly draft = signal('');
  protected readonly maxLength = MAX_MESSAGE_LENGTH;
  protected readonly suggestions = ['أتبرع إزاي؟', 'عايز أتطوع', 'محتاج مساعدة'];

  private readonly messageList = viewChild.required<ElementRef<HTMLElement>>('messageList');

  constructor() {
    // Runs after Angular updates the DOM (browser only), so scrollHeight includes the new text.
    afterRenderEffect(() => {
      this.chat.messages();
      const list = this.messageList().nativeElement;
      list.scrollTop = list.scrollHeight;
    });
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
