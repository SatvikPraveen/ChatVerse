import { Router } from 'express';
import { z } from 'zod';
import { messageEditSchema, messageSearchSchema, objectIdSchema, reactionSchema } from '@chatverse/protocol';
import type { Services } from '../../services/index.js';
import { validate } from '../middleware/validate.js';
import { authOf, ok, wrap } from '../respond.js';

const idParams = z.object({ id: objectIdSchema });
const editBody = messageEditSchema.innerType().omit({ messageId: true });
const reactionBody = reactionSchema.omit({ messageId: true });

export function messagesRoutes(services: Services): Router {
  const router = Router();
  const { messages } = services;

  router.get('/search', validate('query', messageSearchSchema), wrap(async (req, res) => {
    const q = req.query as unknown as { q: string; conversationId?: string; limit: number };
    ok(res, await messages.search(authOf(req).userId, q));
  }));
  router.patch('/:id', validate('params', idParams), validate('body', editBody), wrap(async (req, res) => {
    const input = messageEditSchema.parse({ ...req.body, messageId: req.params.id });
    ok(res, await messages.edit(authOf(req).userId, input));
  }));
  router.delete('/:id', validate('params', idParams), wrap(async (req, res) => ok(res, await messages.remove(authOf(req).userId, req.params.id!))));
  router.post('/:id/reactions', validate('params', idParams), validate('body', reactionBody), wrap(async (req, res) =>
    ok(res, await messages.toggleReaction(authOf(req).userId, req.params.id!, req.body.emoji)),
  ));
  return router;
}
