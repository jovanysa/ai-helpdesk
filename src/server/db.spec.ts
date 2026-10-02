import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from './db';

const now = new Date().toISOString();

describe('openDatabase', () => {
  it('creates the four tables', () => {
    const db = openDatabase(':memory:');
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row['name']);
    expect(names).toEqual(['knowledge_chunks', 'sessions', 'staff_users', 'tickets']);
  });

  it('can be opened twice on the same file without errors', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'helpdesk-')), 'nested', 'test.db');
    openDatabase(path).close();
    expect(() => openDatabase(path).close()).not.toThrow();
  });

  it('enforces the allowed ticket status values', () => {
    const db = openDatabase(':memory:');
    const insert = db.prepare(
      'INSERT INTO tickets (name, phone, description, source, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    expect(() => insert.run('a', '01001234567', 'desc', 'form', 'closed', now, now)).toThrow(/CHECK constraint failed/);
  });

  it('enforces foreign keys', () => {
    const db = openDatabase(':memory:');
    expect(() =>
      db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run('h', 999, now),
    ).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('waits for a locked database instead of failing at once', () => {
    const db = openDatabase(':memory:');
    expect(db.prepare('PRAGMA busy_timeout').get()?.['timeout']).toBe(5000);
  });
});
