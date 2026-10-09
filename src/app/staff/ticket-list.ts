import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TicketFilters,
  TicketSummary,
} from '../tickets/ticket.model';
import { TicketsApi } from '../tickets/tickets-api';
import { GapsApi } from '../gaps/gaps-api';

@Component({
  selector: 'app-ticket-list',
  imports: [RouterLink, DatePipe],
  templateUrl: './ticket-list.html',
  styleUrl: './ticket-list.scss',
})
export class TicketList implements OnInit {
  private readonly api = inject(TicketsApi);
  private readonly gapsApi = inject(GapsApi);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  protected readonly tickets = signal<TicketSummary[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  /** Open unanswered questions, shown next to the link; stays 0 if it cannot load. */
  protected readonly openGaps = signal(0);
  private filters: TicketFilters = {};
  private loadRequest?: Subscription;

  protected readonly statuses = TICKET_STATUSES;
  protected readonly categories = TICKET_CATEGORIES;
  protected readonly priorities = TICKET_PRIORITIES;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly categoryLabels = CATEGORY_LABELS;
  protected readonly priorityLabels = PRIORITY_LABELS;

  ngOnInit(): void {
    this.load();
    // A failed count is not worth an error on the tickets page: the link still works.
    this.gapsApi.list('no_answer').subscribe({ next: (groups) => this.openGaps.set(groups.length), error: () => undefined });
  }

  protected load(): void {
    // An answer for an older filter must never replace the one for the current filter.
    this.loadRequest?.unsubscribe();
    this.loading.set(true);
    this.loadRequest = this.api.list(this.filters).subscribe({
      next: (tickets) => {
        this.tickets.set(tickets);
        this.failed.set(false);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  protected setFilter(key: keyof TicketFilters, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.filters = { ...this.filters, [key]: value || undefined };
    this.load();
  }

  protected async logout(): Promise<void> {
    await this.auth.logout().catch(() => undefined);
    await this.router.navigate(['/staff/login']);
  }
}
