import { Router } from 'express';
import { loginSchema, refreshSchema, registerSchema } from '@chatverse/protocol';
import type { Deps } from '../../deps.js';
import type { Services } from '../../services/index.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { ok, wrap } from '../respond.js';

export function authRoutes(deps: Deps, services: Services): Router {
  const router = Router();
  // Credential endpoints get a much tighter budget than the general API.
  const tight = rateLimit(deps, {
    scope: 'auth',
    windowSec: 60,
    max: deps.env.NODE_ENV === 'test' ? 10_000 : deps.env.AUTH_RATE_LIMIT_MAX,
  });

  router.post(
    '/register',
    tight,
    validate('body', registerSchema),
    wrap(async (req, res) => ok(res, await services.auth.register(req.body), 201)),
  );
  router.post(
    '/login',
    tight,
    validate('body', loginSchema),
    wrap(async (req, res) => ok(res, await services.auth.login(req.body))),
  );
  router.post(
    '/refresh',
    tight,
    validate('body', refreshSchema),
    wrap(async (req, res) => ok(res, await services.auth.refresh(req.body.refreshToken))),
  );
  router.post(
    '/logout',
    validate('body', refreshSchema),
    wrap(async (req, res) => {
      await services.auth.logout(req.body.refreshToken);
      ok(res, { loggedOut: true });
    }),
  );
  return router;
}
