import type { DatabaseSync } from 'node:sqlite';
import { hashPassword, verifyPassword } from './passwords';

export interface StaffUser {
  id: number;
  email: string;
  name: string;
}

interface StaffRow extends StaffUser {
  password_hash: string;
}

export class StaffRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => Date = () => new Date(),
  ) {}

  create(email: string, name: string, password: string): StaffUser {
    const normalized = normalizeEmail(email);
    const result = this.db
      .prepare('INSERT INTO staff_users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(normalized, name, hashPassword(password), this.now().toISOString());
    return { id: Number(result.lastInsertRowid), email: normalized, name };
  }

  /** Creates the account unless one with this email already exists (which is left unchanged). */
  ensure(email: string, name: string, password: string): StaffUser {
    return this.findByEmail(email) ?? this.create(email, name, password);
  }

  findById(id: number): StaffUser | undefined {
    const row = this.db.prepare('SELECT id, email, name FROM staff_users WHERE id = ?').get(id);
    return row ? toUser(row as unknown as StaffUser) : undefined;
  }

  findByEmail(email: string): StaffUser | undefined {
    const row = this.db
      .prepare('SELECT id, email, name FROM staff_users WHERE email = ?')
      .get(normalizeEmail(email));
    return row ? toUser(row as unknown as StaffUser) : undefined;
  }

  /** Returns the user when the email and password match. */
  authenticate(email: string, password: string): StaffUser | undefined {
    const row = this.db
      .prepare('SELECT id, email, name, password_hash FROM staff_users WHERE email = ?')
      .get(normalizeEmail(email)) as unknown as StaffRow | undefined;
    // Without a row, still run one scrypt so a wrong email takes as long as a wrong password
    // (otherwise response time reveals which emails are staff accounts).
    const valid = verifyPassword(password, row?.password_hash ?? dummyHash());
    return row && valid ? toUser(row) : undefined;
  }
}

let cachedDummyHash: string | undefined;
function dummyHash(): string {
  cachedDummyHash ??= hashPassword('timing-equalizer');
  return cachedDummyHash;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// node:sqlite returns null-prototype objects; copy into plain ones.
function toUser({ id, email, name }: StaffUser): StaffUser {
  return { id, email, name };
}
