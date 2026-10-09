import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class FeedbackApi {
  private readonly http = inject(HttpClient);

  /** A thumbs-down also shows the question to staff, so they can write a better answer. */
  give(question: string, reply: string, helpful: boolean): Observable<void> {
    return this.http.post<void>('/api/feedback', { question, reply, helpful });
  }
}
