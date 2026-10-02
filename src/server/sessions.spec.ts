import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from './db';
import { SESSION_TTL_MS, SessionStore } from './sessions';
import { StaffRepository, StaffUser } from './staff-repository';

describe('SessionStore', () => {
  let db: DatabaseSync;
  let clock: Date;
  let sessions: SessionStore;
  let user: StaffUser;

  beforeEach(() => {
    db = openDatabase(':memory:');
    clock = new Date('2026-10-02T10:00:00Z');
    sessions = new SessionStore(db, () => clock);
    user = new StaffRepository(db).create('a@x.example', 'A', 'pw123456');
  });

  const rowCount = () => db.prepare('SELECT COUNT(*) AS n FROM sessions').get()?.['n'];

  it('finds the user for a fresh token and stores only its hash', () => {
    const { token, expiresAt } = sessions.create(user.id);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(expiresAt.getTime()).toBe(clock.getTime() + SESSION_TTL_MS);
    expect(sessions.findUser(token)).toEqual(user);
    const stored = db.prepare('SELECT token_hash FROM sessions').get()?.['token_hash'];
    expect(stored).not.toBe(token);
  });

  it('expires sessions after 7 days', () => {
    const { token } = sessions.create(user.id);
    clock = new Date(clock.getTime() + SESSION_TTL_MS + 1);
    expect(sessions.findUser(token)).toBeUndefined();
    expect(rowCount()).toBe(0);
  });

  it('delete logs the session out', () => {
    const { token } = sessions.create(user.id);
    sessions.delete(token);
    expect(sessions.findUser(token)).toBeUndefined();
  });

  it('returns undefined for an unknown token', () => {
    expect(sessions.findUser('nope')).toBeUndefined();
  });
});
