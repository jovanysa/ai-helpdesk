import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export type GapReason = 'no_answer' | 'off_topic';

export interface GapGroup {
  key: string;
  question: string;
  count: number;
  lastAskedAt: string;
  lastReply: string;
}

@Injectable({ providedIn: 'root' })
export class GapsApi {
  private readonly http = inject(HttpClient);

  list(reason: GapReason): Observable<GapGroup[]> {
    return this.http.get<GapGroup[]>('/api/gaps', { params: { reason } });
  }

  resolve(reason: GapReason, key: string): Observable<{ resolved: number }> {
    return this.http.post<{ resolved: number }>('/api/gaps/resolve', { reason, key });
  }

  /** Adds the answer to the knowledge (the chat uses it at once) and closes the question. */
  answer(reason: GapReason, key: string, title: string, answer: string): Observable<{ resolved: number }> {
    return this.http.post<{ resolved: number }>('/api/gaps/answer', { reason, key, title, answer });
  }
}
