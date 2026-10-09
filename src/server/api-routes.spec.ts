import { ApiRequest, createApiRoutes, runRoute } from './api-routes';
import { sessionCookie } from './auth-handlers';
import { openDatabase } from './db';
import { SessionStore } from './sessions';
import { StaffRepository } from './staff-repository';
import { TicketClassifier } from './ticket-classifier';
import { TicketRepository } from './ticket-repository';
import { UnansweredRepository } from './unanswered-questions';
import { FeedbackRepository } from './feedback';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
    const knowledgeDir = mkdtempSync(join(tmpdir(), 'kb-'));
    const knowledge = { refresh: vi.fn(async () => undefined) };
    const feedback = new FeedbackRepository(db, gaps);
    const routes = createApiRoutes({ staff, sessions, tickets, classifier, gaps, knowledge, knowledgeDir, feedback });
    const request = (cookie?: string, overrides: Partial<ApiRequest> = {}): ApiRequest => ({
      params: { id: '1' },
      query: {},
      body: { status: 'resolved' },
      cookie,
      ...overrides,
    });
    return { routes, sessions, tickets, gaps, knowledge, knowledgeDir, feedback, user, request };
  }

  it('keeps only the customer and login endpoints public', async () => {
    const { routes } = setup();
    const publicRoutes = routes.filter((r) => !r.staffOnly).map((r) => `${r.method.toUpperCase()} ${r.path}`);
    expect(publicRoutes.sort()).toEqual(['GET /auth/me', 'POST /auth/login', 'POST /auth/logout', 'POST /feedback', 'POST /tickets']);
  });

  it('refuses every staff route without a valid session and never runs its handler', async () => {
    const { routes, sessions, tickets, request } = setup();
    for (const route of routes.filter((r) => r.staffOnly)) {
      for (const cookie of [undefined, 'sid=forged', 'other=1']) {
        expect((await runRoute(route, sessions, request(cookie))), `${route.method} ${route.path}`).toEqual({
          status: 401,
          body: { error: 'login required' },
        });
      }
    }
    expect(tickets.get(1)).toMatchObject({ status: 'new', classificationStatus: 'pending' });
  });

  it('runs staff routes for a logged-in staff member', async () => {
    const { routes, sessions, user, request } = setup();
    const cookie = sessionCookie(sessions.create(user.id).token, 60).split(';')[0];
    const list = routes.find((r) => r.method === 'get' && r.path === '/tickets')!;
    expect((await runRoute(list, sessions, request(cookie))).status).toBe(200);
  });

  describe('gaps', () => {
    function staffRequest() {
      const ctx = setup();
      const cookie = sessionCookie(ctx.sessions.create(ctx.user.id).token, 60).split(';')[0];
      const route = (method: string, path: string) => ctx.routes.find((r) => r.method === method && r.path === path)!;
      return { ...ctx, cookie, route };
    }

    it('protects the gaps routes', async () => {
      const { routes } = setup();
      expect(routes.filter((r) => r.path.startsWith('/gaps')).map((r) => [r.method, r.path, r.staffOnly])).toEqual([
        ['get', '/gaps', true],
        ['post', '/gaps/resolve', true],
        ['post', '/gaps/answer', true],
      ]);
    });

    it('lists open questions for a reason, no_answer by default', async () => {
      const { gaps, sessions, cookie, route, request } = staffRequest();
      gaps.record('فيه ركنة؟', 'مش عارف', 'no_answer');
      gaps.record('مين كسب الماتش؟', 'refusal', 'off_topic');

      const byDefault = (await runRoute(route('get', '/gaps'), sessions, request(cookie, { query: {} })));
      expect(byDefault).toMatchObject({ status: 200, body: [{ question: 'فيه ركنة؟', count: 1 }] });
      const offTopic = (await runRoute(route('get', '/gaps'), sessions, request(cookie, { query: { reason: 'off_topic' } })));
      expect(offTopic).toMatchObject({ status: 200, body: [{ question: 'مين كسب الماتش؟' }] });
      expect((await runRoute(route('get', '/gaps'), sessions, request(cookie, { query: { reason: 'nope' } }))).status).toBe(400);
    });

    it('resolves a group and rejects a bad body', async () => {
      const { gaps, sessions, cookie, route, request } = staffRequest();
      gaps.record('فيه ركنة؟', 'r', 'no_answer');
      gaps.record('فيه ركنة', 'r', 'no_answer');
      const resolve = (body: unknown) => runRoute(route('post', '/gaps/resolve'), sessions, request(cookie, { body }));

      expect(await resolve({ reason: 'no_answer', key: 'فيه ركنه' })).toEqual({ status: 200, body: { resolved: 2 } });
      expect(gaps.listOpen('no_answer')).toEqual([]);
      expect((await resolve({ reason: 'bad', key: 'x' })).status).toBe(400);
      expect((await resolve({ reason: 'no_answer', key: '  ' })).status).toBe(400);
      expect((await resolve(undefined)).status).toBe(400);
    });

    it('adds a staff answer to the knowledge, refreshes the index and resolves the question', async () => {
      const { gaps, knowledge, knowledgeDir, sessions, cookie, route, request } = staffRequest();
      gaps.record('فيه ركنة؟', 'مش عارف', 'no_answer');
      const answer = (body: unknown) => runRoute(route('post', '/gaps/answer'), sessions, request(cookie, { body }));

      const result = await answer({ reason: 'no_answer', key: 'فيه ركنه', title: 'فيه ركنة جنب المقر؟', answer: 'أيوه، فيه جراج قدام المقر.' });
      expect(result).toEqual({ status: 200, body: { resolved: 1 } });
      expect(readFileSync(join(knowledgeDir, 'staff-answers.md'), 'utf8')).toContain('## فيه ركنة جنب المقر؟\nأيوه، فيه جراج قدام المقر.');
      expect(knowledge.refresh).toHaveBeenCalled();
      expect(gaps.listOpen('no_answer')).toEqual([]);
      expect((await answer({ reason: 'no_answer', key: 'x', title: 'ab', answer: 'ok' })).status).toBe(400);
    });

    it('keeps the question open and reports 503 when the knowledge cannot be refreshed', async () => {
      const { gaps, knowledge, sessions, cookie, route, request } = staffRequest();
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      knowledge.refresh.mockRejectedValueOnce(new Error('Ollama down'));
      gaps.record('فيه ركنة؟', 'مش عارف', 'no_answer');
      const result = await runRoute(route('post', '/gaps/answer'), sessions, request(cookie, {
        body: { reason: 'no_answer', key: 'فيه ركنه', title: 'فيه ركنة؟', answer: 'أيوه، فيه جراج.' },
      }));
      expect(result.status).toBe(503);
      expect(gaps.listOpen('no_answer')).toHaveLength(1);
    });

    it('accepts customer feedback publicly and shows staff the summary', async () => {
      const { sessions, cookie, route, request, gaps } = staffRequest();
      const give = (body: unknown) => runRoute(route('post', '/feedback'), sessions, request(undefined, { body }));
      expect(await give({ question: 'ازاي اتبرع؟', reply: 'رد', helpful: false })).toEqual({ status: 204 });
      expect(await give({ question: 'ازاي اتبرع؟', reply: 'رد', helpful: true })).toEqual({ status: 204 });
      expect((await give({ helpful: 'x' })).status).toBe(400);
      expect(gaps.listOpen('disliked')).toHaveLength(1);
      expect(await runRoute(route('get', '/feedback/summary'), sessions, request(cookie))).toEqual({ status: 200, body: { helpful: 1, total: 2 } });
    });
  });
});
