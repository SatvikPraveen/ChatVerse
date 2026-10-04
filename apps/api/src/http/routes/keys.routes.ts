import { Router } from 'express';
import { z } from 'zod';
import {
  deviceIdSchema,
  objectIdSchema,
  oneTimePreKeysUploadSchema,
  preKeyBundleUploadSchema,
} from '@chatverse/protocol';
import type { Services } from '../../services/index.js';
import { validate } from '../middleware/validate.js';
import { authOf, ok, wrap } from '../respond.js';

const bundleParams = z.object({ userId: objectIdSchema });
const bundleQuery = z.object({ deviceId: deviceIdSchema.optional() });
const deviceQuery = z.object({ deviceId: deviceIdSchema });

export function keysRoutes(services: Services): Router {
  const router = Router();
  const { keys } = services;

  router.put(
    '/bundle',
    validate('body', preKeyBundleUploadSchema),
    wrap(async (req, res) => {
      await keys.uploadBundle(authOf(req).userId, req.body);
      ok(res, { uploaded: true });
    }),
  );
  router.post(
    '/one-time',
    validate('body', oneTimePreKeysUploadSchema),
    wrap(async (req, res) =>
      ok(
        res,
        await keys.addOneTimePreKeys(
          authOf(req).userId,
          req.body.deviceId,
          req.body.oneTimePreKeys,
        ),
      ),
    ),
  );
  router.get(
    '/count',
    validate('query', deviceQuery),
    wrap(async (req, res) => {
      const { deviceId } = req.query as unknown as { deviceId: string };
      ok(res, await keys.count(authOf(req).userId, deviceId));
    }),
  );
  router.get(
    '/bundle/:userId',
    validate('params', bundleParams),
    validate('query', bundleQuery),
    wrap(async (req, res) => {
      const { deviceId } = req.query as unknown as { deviceId?: string };
      ok(res, await keys.fetchBundle(req.params.userId!, deviceId));
    }),
  );
  return router;
}
