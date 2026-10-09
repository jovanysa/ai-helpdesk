import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

// Loaded at runtime: the Angular build's bundler rewrites a static `node:sqlite`
// import to the npm package name `sqlite`, which does not exist.
const { DatabaseSync: Database } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');

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

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id INTEGER PRIMARY KEY,
  file TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  embedding BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS unanswered_questions (
  id INTEGER PRIMARY KEY,
  question TEXT NOT NULL,
  question_key TEXT NOT NULL,
  reply TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('no_answer','off_topic','disliked')),
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS unanswered_open ON unanswered_questions (reason, resolved_at, question_key);

CREATE TABLE IF NOT EXISTS reply_feedback (
  id INTEGER PRIMARY KEY,
  helpful INTEGER NOT NULL CHECK (helpful IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reply_feedback_created ON reply_feedback (created_at);
`;

/** Bump when an existing table must change shape; each step runs once per database file. */
const SCHEMA_VERSION = 1;

function migrate(db: DatabaseSync): void {
  const version = Number(db.prepare('PRAGMA user_version').get()?.['user_version'] ?? 0);
  if (version < 1) {
    // v1: "disliked" joined the allowed reasons. SQLite cannot change a CHECK constraint
    // in place, so a table made by an older version is rebuilt with its rows copied over.
    const table = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'unanswered_questions'").get();
    if (!String(table?.['sql'] ?? '').includes('disliked')) {
      db.exec('BEGIN');
      try {
        db.exec(`ALTER TABLE unanswered_questions RENAME TO unanswered_questions_v0;
          DROP INDEX IF EXISTS unanswered_open;`);
        db.exec(SCHEMA);
        db.exec(`INSERT INTO unanswered_questions SELECT * FROM unanswered_questions_v0;
          DROP TABLE unanswered_questions_v0;`);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  }
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
}

/** Opens (and creates if needed) the helpdesk database with its schema. */
export function openDatabase(path: string): DatabaseSync {
  const inMemory = path === ':memory:';
  if (!inMemory) mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path);
  db.exec('PRAGMA foreign_keys = ON;');
  // Wait up to 5s for a lock (e.g. the file is open in a DB browser) instead of failing at once.
  db.exec('PRAGMA busy_timeout = 5000;');
  // WAL lets reads continue while a write is in progress; it needs a real file.
  if (!inMemory) db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}
