import { ApiResult } from './api-result';
import { createAuthHandlers, readSessionToken } from './auth-handlers';
import { SessionStore } from './sessions';
import { StaffRepository } from './staff-repository';
import { TicketClassifier } from './ticket-classifier';
import { createTicketHandlers } from './ticket-handlers';
import { TicketRepository } from './ticket-repository';
import { GAP_REASONS, UnansweredRepository } from './unanswered-questions';
import { KnowledgeBase } from './knowledge-base';
import { appendStaffAnswer, validateStaffAnswer } from './staff-answers';
import { FeedbackRepository, validateFeedback } from './feedback';
import { isOneOf } from './ticket-types';

export interface ApiDeps {
  staff: StaffRepository;
  sessions: SessionStore;
  tickets: TicketRepository;
  classifier: TicketClassifier;
  gaps: UnansweredRepository;
  knowledge: Pick<KnowledgeBase, 'refresh'>;
  knowledgeDir: string;
  feedback: FeedbackRepository;
}

/** The parts of an HTTP request the handlers need, without Express types. */
export interface ApiRequest {
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  body: unknown;
  cookie: string | undefined;
}

export interface ApiRoute {
  method: 'get' | 'post' | 'patch';
  path: string;
  /** Staff-only routes return 401 unless the request carries a valid session. */
  staffOnly: boolean;
  handle(req: ApiRequest): ApiResult | Promise<ApiResult>;
}

/** Every API route in one table, so which routes are public is visible (and tested) in one place. */
export function createApiRoutes({
  staff,
  sessions,
  tickets,
  classifier,
  gaps,
  knowledge,
  knowledgeDir,
  feedback,
}: ApiDeps): ApiRoute[] {
  const auth = createAuthHandlers(staff, sessions);
  const ticketHandlers = createTicketHandlers(tickets, classifier);
  const token = (req: ApiRequest) => readSessionToken(req.cookie);

  return [
    { method: 'post', path: '/auth/login', staffOnly: false, handle: (req) => auth.login(req.body, token(req)) },
    { method: 'post', path: '/auth/logout', staffOnly: false, handle: (req) => auth.logout(token(req)) },
    { method: 'get', path: '/auth/me', staffOnly: false, handle: (req) => auth.me(token(req)) },
    { method: 'post', path: '/tickets', staffOnly: false, handle: (req) => ticketHandlers.create(req.body) },
    { method: 'post', path: '/feedback', staffOnly: false, handle: (req) => giveFeedback(feedback, req.body) },
    { method: 'get', path: '/feedback/summary', staffOnly: true, handle: () => ({ status: 200, body: feedback.summary(30) }) },
    { method: 'get', path: '/tickets', staffOnly: true, handle: (req) => ticketHandlers.list(req.query) },
    { method: 'get', path: '/tickets/:id', staffOnly: true, handle: (req) => ticketHandlers.get(req.params['id']) },
    {
      method: 'patch',
      path: '/tickets/:id',
      staffOnly: true,
      handle: (req) => ticketHandlers.update(req.params['id'], req.body),
    },
    {
      method: 'post',
      path: '/tickets/:id/classify',
      staffOnly: true,
      handle: (req) => ticketHandlers.reclassify(req.params['id']),
    },
    { method: 'get', path: '/gaps', staffOnly: true, handle: (req) => listGaps(gaps, req.query) },
    { method: 'post', path: '/gaps/resolve', staffOnly: true, handle: (req) => resolveGap(gaps, req.body) },
    {
      method: 'post',
      path: '/gaps/answer',
      staffOnly: true,
      handle: (req) => answerGap(gaps, knowledge, knowledgeDir, req.body),
    },
  ];
}

/** Runs a route, refusing staff-only routes without a valid session. */
export function runRoute(route: ApiRoute, sessions: SessionStore, req: ApiRequest): ApiResult | Promise<ApiResult> {
  if (route.staffOnly) {
    const token = readSessionToken(req.cookie);
    if (!token || !sessions.findUser(token)) return { status: 401, body: { error: 'login required' } };
  }
  return route.handle(req);
}

function listGaps(gaps: UnansweredRepository, query: Record<string, unknown>): ApiResult {
  const reason = query['reason'] ?? 'no_answer';
  if (!isOneOf(GAP_REASONS, reason)) return { status: 400, body: { error: 'reason must be no_answer or off_topic' } };
  return { status: 200, body: gaps.listOpen(reason) };
}

function resolveGap(gaps: UnansweredRepository, body: unknown): ApiResult {
  const { reason, key } = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  if (!isOneOf(GAP_REASONS, reason) || typeof key !== 'string' || !key.trim()) {
    return { status: 400, body: { error: 'reason and key are required' } };
  }
  return { status: 200, body: { resolved: gaps.resolve(reason, key) } };
}

/** Writes the answer into the knowledge, re-indexes so the chat uses it at once, then closes the question. */
async function answerGap(
  gaps: UnansweredRepository,
  knowledge: Pick<KnowledgeBase, 'refresh'>,
  knowledgeDir: string,
  body: unknown,
): Promise<ApiResult> {
  const parsed = validateStaffAnswer(body);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const { reason, key, title, answer } = parsed.value;
  // Two staff on stale pages would otherwise write the same answer twice.
  if (!gaps.listOpen(reason).some((group) => group.key === key)) {
    return { status: 409, body: { error: 'this question was already handled' } };
  }

  appendStaffAnswer(knowledgeDir, title, answer);
  try {
    await knowledge.refresh();
  } catch (error) {
    // The answer is saved in the file; the next successful index picks it up.
    console.error('[gaps] knowledge refresh failed:', error instanceof Error ? error.message : error);
    return { status: 503, body: { error: 'answer saved, but the knowledge could not be refreshed' } };
  }
  return { status: 200, body: { resolved: gaps.resolve(reason, key) } };
}

/** Public: a customer rates a reply. Stored texts are capped by the questions repository. */
function giveFeedback(feedback: FeedbackRepository, body: unknown): ApiResult {
  const parsed = validateFeedback(body);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  feedback.record(parsed.value);
  return { status: 204 };
}
