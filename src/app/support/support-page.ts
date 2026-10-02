import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TicketsApi } from '../tickets/tickets-api';
import { phoneValidator, trimmedLength } from '../tickets/validators';

@Component({
  selector: 'app-support-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './support-page.html',
})
export class SupportPage {
  private readonly api = inject(TicketsApi);

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', trimmedLength(2, 100)],
    phone: ['', phoneValidator],
    description: ['', trimmedLength(5, 2000)],
  });
  protected readonly submitting = signal(false);
  protected readonly failed = signal(false);
  protected readonly ticketId = signal<number | null>(null);

  protected submit(): void {
    if (this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    this.failed.set(false);

    const { name, phone, description } = this.form.getRawValue();
    // The server normalizes the phone; we only trim.
    this.api.create({ name: name.trim(), phone: phone.trim(), description: description.trim() }).subscribe({
      next: ({ id }) => {
        this.ticketId.set(id);
        this.submitting.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.submitting.set(false);
      },
    });
  }
}
