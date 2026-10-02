import { ApiRequest, createApiRoutes, runRoute } from './api-routes';
import { sessionCookie } from './auth-handlers';
import { openDatabase } from './db';
import { SessionStore } from './sessions';
import { StaffRepository } from './staff-repository';
import { TicketClassifier } from './ticket-classifier';
import { TicketRepository } from './ticket-repository';

describe('API routes', () => {
  function setup() {
    const db = openDatabase(':memory:');
    const staff = new StaffRepository(db);
    const sessions = new SessionStore(db);
    const tickets = new TicketRepository(db);
    const classifier = new TicketClassifier(tickets, async () => ({ category: 'other', priority: 'low' }));
    const user = staff.create('admin@x.example', 'Admin', 'pw123456');
    tickets.create({ name: 'منى', phone: '01001234567', description: 'عايزة أتطوع', transcript: null });
    const routes = createApiRoutes({ staff, sessions, tickets, classifier });
    const request = (cookie?: string, overrides: Partial<ApiRequest> = {}): ApiRequest => ({
      params: { id: '1' },
      query: {},
      body: { status: 'resolved' },
      cookie,
      ...overrides,
    });
    return { routes, sessions, tickets, user, request };
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
});
