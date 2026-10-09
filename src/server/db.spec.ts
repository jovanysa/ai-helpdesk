import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from './db';

const now = new Date().toISOString();

describe('openDatabase', () => {
  it('creates all tables', () => {
    const db = openDatabase(':memory:');
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row['name']);
    expect(names).toEqual(['knowledge_chunks', 'reply_feedback', 'sessions', 'staff_users', 'tickets', 'unanswered_questions']);
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

  it('upgrades a database made before replies could be disliked, keeping its questions', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'helpdesk-')), 'old.db');
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE unanswered_questions (
      id INTEGER PRIMARY KEY, question TEXT NOT NULL, question_key TEXT NOT NULL, reply TEXT NOT NULL,
      reason TEXT NOT NULL CHECK (reason IN ('no_answer','off_topic')), created_at TEXT NOT NULL, resolved_at TEXT)`);
    old.prepare('INSERT INTO unanswered_questions (question, question_key, reply, reason, created_at) VALUES (?, ?, ?, ?, ?)').run('فيه ركنة؟', 'فيه ركنه', 'r', 'no_answer', now);
    old.close();

    const db = openDatabase(path);
    expect(db.prepare('SELECT question FROM unanswered_questions').all().map((r) => r['question'])).toEqual(['فيه ركنة؟']);
    expect(() =>
      db.prepare('INSERT INTO unanswered_questions (question, question_key, reply, reason, created_at) VALUES (?, ?, ?, ?, ?)').run('q', 'q', 'r', 'disliked', now),
    ).not.toThrow();
    expect(db.prepare('PRAGMA user_version').get()?.['user_version']).toBe(1);
    db.close();
    expect(() => openDatabase(path).close()).not.toThrow();
  });
});
