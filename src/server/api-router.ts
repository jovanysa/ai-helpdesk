import { ErrorRequestHandler, Response, Router } from 'express';
import { ApiResult } from './api-result';
import { ApiDeps, createApiRoutes, runRoute } from './api-routes';

/** Thin Express glue: the route table and the session check live in api-routes.ts, which is unit-tested. */
export function createApiRouter(deps: ApiDeps): Router {
  const router = Router();
  for (const route of createApiRoutes(deps)) {
    router[route.method](route.path, (req, res) =>
      send(
        res,
        runRoute(route, deps.sessions, {
          params: req.params,
          query: req.query as Record<string, unknown>,
          body: req.body,
          cookie: req.headers.cookie,
        }),
      ),
    );
  }
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
