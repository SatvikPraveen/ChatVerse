import { Router } from 'express';
import { z } from 'zod';
import { pushSubscriptionSchema } from '@chatverse/protocol';
import type { Services } from '../../services/index.js';
import { validate } from '../middleware/validate.js';
import { authOf, ok, wrap } from '../respond.js';

const endpointBody = z.object({ endpoint: z.string().url().max(2048) });

export function pushRoutes(services: Services): Router {
  const router = Router();
  router.get('/vapid', (_req, res) => ok(res, { enabled: services.push.enabled, publicKey: services.push.publicKey }));
  router.post('/subscriptions', validate('body', pushSubscriptionSchema), wrap(async (req, res) => {
    await services.push.subscribe(authOf(req).userId, req.body);
    ok(res, { subscribed: true }, 201);
  }));
  router.delete('/subscriptions', validate('body', endpointBody), wrap(async (req, res) => {
    await services.push.unsubscribe(authOf(req).userId, req.body.endpoint);
    ok(res, { unsubscribed: true });
  }));
  return router;
}
