import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  Ticket,
  TicketPatch,
} from '../tickets/ticket.model';
import { TicketsApi } from '../tickets/tickets-api';

@Component({
  selector: 'app-ticket-detail',
  imports: [RouterLink, DatePipe],
  templateUrl: './ticket-detail.html',
  styleUrl: './ticket-detail.scss',
})
export class TicketDetail implements OnInit {
  private readonly api = inject(TicketsApi);

  /** Filled from the `:id` route parameter (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly ticket = signal<Ticket | null>(null);
  protected readonly notFound = signal(false);
  protected readonly failed = signal(false);
  protected readonly saving = signal(false);

  protected readonly statuses = TICKET_STATUSES;
  protected readonly categories = TICKET_CATEGORIES;
  protected readonly priorities = TICKET_PRIORITIES;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly categoryLabels = CATEGORY_LABELS;
  protected readonly priorityLabels = PRIORITY_LABELS;

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.api.get(Number(this.id())).subscribe({
      next: (ticket) => {
        this.ticket.set(ticket);
        this.failed.set(false);
      },
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 404) this.notFound.set(true);
        else this.failed.set(true);
      },
    });
  }

  /** Saves a select as soon as it changes. */
  protected update(field: keyof TicketPatch, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (!value) return;
    this.save(this.api.update(Number(this.id()), { [field]: value } as TicketPatch));
  }

  protected reclassify(): void {
    this.save(this.api.reclassify(Number(this.id())));
  }

  private save(request: ReturnType<TicketsApi['update']>): void {
    this.saving.set(true);
    this.failed.set(false);
    request.subscribe({
      next: (ticket) => {
        this.ticket.set(ticket);
        this.saving.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.saving.set(false);
      },
    });
  }
}
