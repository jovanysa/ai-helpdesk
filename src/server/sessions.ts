import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { StaffUser } from './staff-repository';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class SessionStore {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  create(userId: number): { token: string; expiresAt: Date } {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(this.now().getTime() + SESSION_TTL_MS);
    this.db
      .prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(hashToken(token), userId, expiresAt.toISOString());
    return { token, expiresAt };
  }

  /** Returns the logged-in user for a token, or undefined if it is unknown or expired. */
  findUser(token: string): StaffUser | undefined {
    const row = this.db
      .prepare(
        `SELECT u.id, u.email, u.name, s.expires_at
         FROM sessions s JOIN staff_users u ON u.id = s.user_id
         WHERE s.token_hash = ?`,
      )
      .get(hashToken(token)) as unknown as (StaffUser & { expires_at: string }) | undefined;
    if (!row) return undefined;
    if (row.expires_at <= this.now().toISOString()) {
      this.delete(token);
      return undefined;
    }
    return { id: row.id, email: row.email, name: row.name };
  }

  delete(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  }
}

// Only the hash is stored, so a leaked database does not hand out working sessions.
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
