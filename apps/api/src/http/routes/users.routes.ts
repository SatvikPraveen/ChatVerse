import { Router } from 'express';
import { z } from 'zod';
import { objectIdSchema, updateMeSchema, userSearchSchema } from '@chatverse/protocol';
import type { Services } from '../../services/index.js';
import { validate } from '../middleware/validate.js';
import { authOf, ok, wrap } from '../respond.js';

const idParams = z.object({ id: objectIdSchema });
const idsQuery = z.object({
  ids: z
    .string()
    .transform((s) => s.split(',').filter(Boolean))
    .pipe(z.array(objectIdSchema).min(1).max(100)),
});

export function usersRoutes(services: Services): Router {
  const router = Router();
  router.get(
    '/me',
    wrap(async (req, res) => ok(res, await services.users.me(authOf(req).userId))),
  );
  router.patch(
    '/me',
    validate('body', updateMeSchema),
    wrap(async (req, res) => ok(res, await services.users.updateMe(authOf(req).userId, req.body))),
  );
  router.get(
    '/search',
    validate('query', userSearchSchema),
    wrap(async (req, res) => {
      const { q, limit } = req.query as unknown as { q: string; limit: number };
      ok(res, await services.users.search(q, limit, authOf(req).userId));
    }),
  );
  router.get(
    '/presence',
    validate('query', idsQuery),
    wrap(async (req, res) => {
      const { ids } = req.query as unknown as { ids: string[] };
      ok(res, await services.presence.getMany(ids));
    }),
  );
  router.get(
    '/:id',
    validate('params', idParams),
    wrap(async (req, res) => ok(res, await services.users.getPublic(req.params.id!))),
  );
  return router;
}
