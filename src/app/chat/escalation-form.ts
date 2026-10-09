import { Component, inject, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TicketsApi } from '../tickets/tickets-api';
import { phoneValidator, trimmedLength } from '../tickets/validators';
import { ChatService } from './chat.service';

const MAX_TRANSCRIPT = 20;
const MIN_DESCRIPTION = 5;
const FALLBACK_DESCRIPTION = 'طلب تواصل مع موظف من الشات';

/** Turns the current chat into a ticket so a staff member can follow up by phone. */
@Component({
  selector: 'app-escalation-form',
  imports: [ReactiveFormsModule],
  templateUrl: './escalation-form.html',
  styleUrl: './escalation-form.scss',
})
export class EscalationForm {
  private readonly api = inject(TicketsApi);
  private readonly chat = inject(ChatService);

  readonly closed = output<void>();
  /** Emits the new ticket's number; the chat then shows it in place of the escalate button. */
  readonly created = output<number>();

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', trimmedLength(2, 100)],
    phone: ['', phoneValidator],
    note: ['', Validators.maxLength(2000)],
  });
  protected readonly submitting = signal(false);
  protected readonly failed = signal(false);

  protected submit(): void {
    if (this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    this.failed.set(false);

    const { name, phone, note } = this.form.getRawValue();
    const transcript = this.chat
      .messages()
      .filter((m) => m.content.trim())
      .slice(-MAX_TRANSCRIPT)
      .map(({ role, content }) => ({ role, content }));
    this.api
      .create({ name: name.trim(), phone: phone.trim(), description: this.describe(note, transcript), transcript })
      .subscribe({
        next: ({ id }) => {
          this.created.emit(id);
          this.submitting.set(false);
        },
        error: () => {
          this.failed.set(true);
          this.submitting.set(false);
        },
      });
  }

  /** The note if given, else the customer's last message, else a default the server will accept. */
  private describe(note: string, transcript: { role: string; content: string }[]): string {
    const lastUserMessage = transcript.filter((m) => m.role === 'user').at(-1)?.content ?? '';
    const description = (note.trim() || lastUserMessage.trim()).slice(0, 2000);
    return description.length >= MIN_DESCRIPTION ? description : FALLBACK_DESCRIPTION;
  }
}
