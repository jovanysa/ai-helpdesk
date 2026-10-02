import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS staff_users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  description TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('chat','form')),
  transcript TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','resolved')),
  category TEXT CHECK (category IN ('donation','volunteering','help_request','complaint','other')),
  priority TEXT CHECK (priority IN ('low','medium','high')),
  classification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (classification_status IN ('pending','done','failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

/** Opens (and creates if needed) the helpdesk database with its schema. */
export function openDatabase(path: string): DatabaseSync {
  const inMemory = path === ':memory:';
  if (!inMemory) mkdirSync(dirname(path), { recursive: true });

  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  // WAL lets reads continue while a write is in progress; it needs a real file.
  if (!inMemory) db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}
