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
}
