import { ApiRequest, createApiRoutes, runRoute } from './api-routes';
import { sessionCookie } from './auth-handlers';
import { openDatabase } from './db';
import { SessionStore } from './sessions';
import { StaffRepository } from './staff-repository';
import { TicketClassifier } from './ticket-classifier';
import { TicketRepository } from './ticket-repository';
import { UnansweredRepository } from './unanswered-questions';

describe('API routes', () => {
  function setup() {
    const db = openDatabase(':memory:');
    const staff = new StaffRepository(db);
    const sessions = new SessionStore(db);
    const tickets = new TicketRepository(db);
    const classifier = new TicketClassifier(tickets, async () => ({ category: 'other', priority: 'low' }));
    const user = staff.create('admin@x.example', 'Admin', 'pw123456');
    tickets.create({ name: 'منى', phone: '01001234567', description: 'عايزة أتطوع', transcript: null });
    const gaps = new UnansweredRepository(db);
    const routes = createApiRoutes({ staff, sessions, tickets, classifier, gaps });
    const request = (cookie?: string, overrides: Partial<ApiRequest> = {}): ApiRequest => ({
      params: { id: '1' },
      query: {},
      body: { status: 'resolved' },
      cookie,
      ...overrides,
    });
    return { routes, sessions, tickets, gaps, user, request };
  }

  it('keeps only the customer and login endpoints public', () => {
    const { routes } = setup();
    const publicRoutes = routes.filter((r) => !r.staffOnly).map((r) => `${r.method.toUpperCase()} ${r.path}`);
    expect(publicRoutes.sort()).toEqual(['GET /auth/me', 'POST /auth/login', 'POST /auth/logout', 'POST /tickets']);
  });

  it('refuses every staff route without a valid session and never runs its handler', () => {
    const { routes, sessions, tickets, request } = setup();
    for (const route of routes.filter((r) => r.staffOnly)) {
      for (const cookie of [undefined, 'sid=forged', 'other=1']) {
        expect(runRoute(route, sessions, request(cookie)), `${route.method} ${route.path}`).toEqual({
          status: 401,
          body: { error: 'login required' },
        });
      }
    }
    expect(tickets.get(1)).toMatchObject({ status: 'new', classificationStatus: 'pending' });
  });

  it('runs staff routes for a logged-in staff member', () => {
    const { routes, sessions, user, request } = setup();
    const cookie = sessionCookie(sessions.create(user.id).token, 60).split(';')[0];
    const list = routes.find((r) => r.method === 'get' && r.path === '/tickets')!;
    expect(runRoute(list, sessions, request(cookie)).status).toBe(200);
  });

  describe('gaps', () => {
    function staffRequest() {
      const ctx = setup();
      const cookie = sessionCookie(ctx.sessions.create(ctx.user.id).token, 60).split(';')[0];
      const route = (method: string, path: string) => ctx.routes.find((r) => r.method === method && r.path === path)!;
      return { ...ctx, cookie, route };
    }

    it('protects the gaps routes', () => {
      const { routes } = setup();
      expect(routes.filter((r) => r.path.startsWith('/gaps')).map((r) => [r.method, r.path, r.staffOnly])).toEqual([
        ['get', '/gaps', true],
        ['post', '/gaps/resolve', true],
      ]);
    });

    it('lists open questions for a reason, no_answer by default', () => {
      const { gaps, sessions, cookie, route, request } = staffRequest();
      gaps.record('فيه ركنة؟', 'مش عارف', 'no_answer');
      gaps.record('مين كسب الماتش؟', 'refusal', 'off_topic');

      const byDefault = runRoute(route('get', '/gaps'), sessions, request(cookie, { query: {} }));
      expect(byDefault).toMatchObject({ status: 200, body: [{ question: 'فيه ركنة؟', count: 1 }] });
      const offTopic = runRoute(route('get', '/gaps'), sessions, request(cookie, { query: { reason: 'off_topic' } }));
      expect(offTopic).toMatchObject({ status: 200, body: [{ question: 'مين كسب الماتش؟' }] });
      expect(runRoute(route('get', '/gaps'), sessions, request(cookie, { query: { reason: 'nope' } })).status).toBe(400);
    });

    it('resolves a group and rejects a bad body', () => {
      const { gaps, sessions, cookie, route, request } = staffRequest();
      gaps.record('فيه ركنة؟', 'r', 'no_answer');
      gaps.record('فيه ركنة', 'r', 'no_answer');
      const resolve = (body: unknown) => runRoute(route('post', '/gaps/resolve'), sessions, request(cookie, { body }));

      expect(resolve({ reason: 'no_answer', key: 'فيه ركنه' })).toEqual({ status: 200, body: { resolved: 2 } });
      expect(gaps.listOpen('no_answer')).toEqual([]);
      expect(resolve({ reason: 'bad', key: 'x' }).status).toBe(400);
      expect(resolve({ reason: 'no_answer', key: '  ' }).status).toBe(400);
      expect(resolve(undefined).status).toBe(400);
    });
  });
});
