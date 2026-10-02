import { ErrorRequestHandler, RequestHandler, Response, Router } from 'express';
import { ApiResult } from './api-result';
import { createAuthHandlers, readSessionToken } from './auth-handlers';
import { SessionStore } from './sessions';
import { StaffRepository } from './staff-repository';
import { TicketClassifier } from './ticket-classifier';
import { createTicketHandlers } from './ticket-handlers';
import { TicketRepository } from './ticket-repository';

export interface ApiDeps {
  staff: StaffRepository;
  sessions: SessionStore;
  tickets: TicketRepository;
  classifier: TicketClassifier;
}

/** Thin Express glue: all decisions live in the handlers, which are unit-tested. */
export function createApiRouter({ staff, sessions, tickets, classifier }: ApiDeps): Router {
  const router = Router();
  const auth = createAuthHandlers(staff, sessions);
  const ticketHandlers = createTicketHandlers(tickets, classifier);

  const requireStaff: RequestHandler = (req, res, next) => {
    const token = readSessionToken(req.headers.cookie);
    if (token && sessions.findUser(token)) {
      next();
      return;
    }
    res.status(401).json({ error: 'login required' });
  };

  router.post('/auth/login', (req, res) => send(res, auth.login(req.body)));
  router.post('/auth/logout', (req, res) => send(res, auth.logout(readSessionToken(req.headers.cookie))));
  router.get('/auth/me', (req, res) => send(res, auth.me(readSessionToken(req.headers.cookie))));

  router.post('/tickets', (req, res) => send(res, ticketHandlers.create(req.body)));
  router.get('/tickets', requireStaff, (req, res) =>
    send(res, ticketHandlers.list(req.query as Record<string, unknown>)),
  );
  router.get('/tickets/:id', requireStaff, (req, res) => send(res, ticketHandlers.get(req.params['id'])));
  router.patch('/tickets/:id', requireStaff, (req, res) =>
    send(res, ticketHandlers.update(req.params['id'], req.body)),
  );
  router.post('/tickets/:id/classify', requireStaff, (req, res) =>
    send(res, ticketHandlers.reclassify(req.params['id'])),
  );

  return router;
}

function send(res: Response, result: ApiResult): void {
  if (result.setCookie) res.setHeader('Set-Cookie', result.setCookie);
  res.status(result.status);
  if (result.body === undefined) res.end();
  else res.json(result.body);
}

/** Turns body-parser failures (bad JSON, body too large) into JSON errors instead of HTML pages. */
export const apiErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const status = typeof error?.status === 'number' && error.status >= 400 && error.status < 500 ? error.status : 500;
  if (status === 500) console.error('[api] unexpected error:', error);
  res.status(status).json({ error: status === 500 ? 'internal error' : 'invalid request body' });
};
