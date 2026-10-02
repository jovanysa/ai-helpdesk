import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface StaffUser {
  id: number;
  email: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly _user = signal<StaffUser | null>(null);
  private checked = false;

  readonly user = this._user.asReadonly();

  /** Asks the server once whether this browser already has a valid session cookie. */
  async isLoggedIn(): Promise<boolean> {
    if (!this.checked) {
      try {
        this._user.set(await firstValueFrom(this.http.get<StaffUser>('/api/auth/me')));
      } catch {
        this._user.set(null);
      }
      this.checked = true;
    }
    return this._user() !== null;
  }

  /** Rejects with the HttpErrorResponse when the credentials are wrong. */
  async login(email: string, password: string): Promise<void> {
    const user = await firstValueFrom(this.http.post<StaffUser>('/api/auth/login', { email, password }));
    this._user.set(user);
    this.checked = true;
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
    } finally {
      this.clear();
    }
  }

  /** Forgets the user locally, e.g. after the server says the session expired. */
  clear(): void {
    this._user.set(null);
    this.checked = true;
  }
}
