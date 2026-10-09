import { createAuthHandlers, readSessionToken } from './auth-handlers';
import { openDatabase } from './db';
import { SessionStore } from './sessions';
import { StaffRepository } from './staff-repository';

describe('auth handlers', () => {
  let auth: ReturnType<typeof createAuthHandlers>;

  beforeEach(() => {
    const db = openDatabase(':memory:');
    const staff = new StaffRepository(db);
    staff.create('admin@x.example', 'Admin', 'pw123456');
    auth = createAuthHandlers(staff, new SessionStore(db));
  });

  it('reads the sid cookie among others', () => {
    expect(readSessionToken('a=1; sid=abc; b=2')).toBe('abc');
    expect(readSessionToken('a=1')).toBeUndefined();
    expect(readSessionToken(undefined)).toBeUndefined();
  });

  it('logs in, sets the exact cookie, and me() returns the user', () => {
    const result = auth.login({ email: 'admin@x.example', password: 'pw123456' });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ id: 1, email: 'admin@x.example', name: 'Admin' });
    expect(result.setCookie).toMatch(/^sid=[0-9a-f]{64}; HttpOnly; SameSite=Strict; Path=\/; Max-Age=604800$/);

    const token = readSessionToken(result.setCookie)!;
    expect(auth.me(token)).toEqual({ status: 200, body: { id: 1, email: 'admin@x.example', name: 'Admin' } });
  });

  it('rejects bad credentials with 401 and missing fields with 400', () => {
    expect(auth.login({ email: 'admin@x.example', password: 'nope' })).toEqual({
      status: 401,
      body: { error: 'invalid credentials' },
    });
    expect(auth.login({ email: 'admin@x.example' }).status).toBe(400);
    expect(auth.login(undefined).status).toBe(400);
  });

  it('logout deletes the session and clears the cookie', () => {
    const token = readSessionToken(auth.login({ email: 'admin@x.example', password: 'pw123456' }).setCookie)!;
    expect(auth.logout(token)).toEqual({
      status: 204,
      setCookie: 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0',
    });
    expect(auth.me(token).status).toBe(401);
  });

  it('me without a token is 401', () => {
    expect(auth.me(undefined).status).toBe(401);
  });

  it('logging in again replaces the session the browser already had', () => {
    const first = readSessionToken(auth.login({ email: 'admin@x.example', password: 'pw123456' }).setCookie)!;
    const second = readSessionToken(auth.login({ email: 'admin@x.example', password: 'pw123456' }, first).setCookie)!;
    expect(auth.me(first).status).toBe(401);
    expect(auth.me(second).status).toBe(200);
  });

  it('clears expired sessions when someone logs in', () => {
    const prune = vi.spyOn(SessionStore.prototype, 'pruneExpired');
    auth.login({ email: 'admin@x.example', password: 'pw123456' });
    expect(prune).toHaveBeenCalled();
  });
});

