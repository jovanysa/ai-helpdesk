import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { NewTicket, Ticket, TicketFilters, TicketPatch, TicketSummary } from './ticket.model';

@Injectable({ providedIn: 'root' })
export class TicketsApi {
  private readonly http = inject(HttpClient);

  create(ticket: NewTicket): Observable<{ id: number }> {
    return this.http.post<{ id: number }>('/api/tickets', ticket);
  }

  list(filters: TicketFilters = {}): Observable<TicketSummary[]> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params = params.set(key, value);
    }
    return this.http.get<TicketSummary[]>('/api/tickets', { params });
  }

  get(id: number): Observable<Ticket> {
    return this.http.get<Ticket>(`/api/tickets/${id}`);
  }

  update(id: number, patch: TicketPatch): Observable<Ticket> {
    return this.http.patch<Ticket>(`/api/tickets/${id}`, patch);
  }

  reclassify(id: number): Observable<Ticket> {
    return this.http.post<Ticket>(`/api/tickets/${id}/classify`, {});
  }
}
