import { ApiResult } from './api-result';
import { SESSION_TTL_MS, SessionStore } from './sessions';
import { StaffRepository } from './staff-repository';

export const SESSION_COOKIE = 'sid';

export function readSessionToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE) return value.join('=') || undefined;
  }
  return undefined;
}

/**
 * HttpOnly: page JavaScript cannot read it. SameSite=Strict: other sites cannot
 * make the browser send it. Add `Secure` once the app is served over HTTPS.
 */
export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function createAuthHandlers(staff: StaffRepository, sessions: SessionStore) {
  return {
    /** `currentToken` is the session the browser already has; it is replaced, not kept alongside. */
    login(body: unknown, currentToken?: string): ApiResult {
      const { email, password } = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
      if (typeof email !== 'string' || typeof password !== 'string') {
        return { status: 400, body: { error: 'email and password are required' } };
      }
      const user = staff.authenticate(email, password);
      // Same answer for a wrong email and a wrong password.
      if (!user) return { status: 401, body: { error: 'invalid credentials' } };

      if (currentToken) sessions.delete(currentToken);
      // Expired sessions would otherwise pile up while the server keeps running.
      sessions.pruneExpired();
      const { token } = sessions.create(user.id);
      return { status: 200, body: user, setCookie: sessionCookie(token, SESSION_TTL_MS / 1000) };
    },

    logout(token: string | undefined): ApiResult {
      if (token) sessions.delete(token);
      return { status: 204, setCookie: sessionCookie('', 0) };
    },

    me(token: string | undefined): ApiResult {
      const user = token ? sessions.findUser(token) : undefined;
      return user ? { status: 200, body: user } : { status: 401, body: { error: 'login required' } };
    },
  };
}
