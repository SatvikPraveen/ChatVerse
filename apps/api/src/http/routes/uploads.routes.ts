import { Router } from 'express';
import { z } from 'zod';
import { objectIdSchema, presignUploadSchema } from '@chatverse/protocol';
import type { Services } from '../../services/index.js';
import { validate } from '../middleware/validate.js';
import { authOf, ok, wrap } from '../respond.js';

const idParams = z.object({ id: objectIdSchema });

export function uploadsRoutes(services: Services): Router {
  const router = Router();
  router.post(
    '/presign',
    validate('body', presignUploadSchema),
    wrap(async (req, res) =>
      ok(res, await services.uploads.presign(authOf(req).userId, req.body), 201),
    ),
  );
  router.post(
    '/:id/complete',
    validate('params', idParams),
    wrap(async (req, res) =>
      ok(res, await services.uploads.complete(authOf(req).userId, req.params.id!)),
    ),
  );
  return router;
}
