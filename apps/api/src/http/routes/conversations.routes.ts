import { Router } from 'express';
import { z } from 'zod';
import {
  addParticipantsSchema,
  conversationsQuerySchema,
  createConversationSchema,
  messageCreateBodySchema,
  messageSendSchema,
  messagesQuerySchema,
  objectIdSchema,
  updateConversationSchema,
} from '@chatverse/protocol';
import type { Services } from '../../services/index.js';
import { validate } from '../middleware/validate.js';
import { authOf, ok, wrap } from '../respond.js';

const idParams = z.object({ id: objectIdSchema });
const memberParams = z.object({ id: objectIdSchema, userId: objectIdSchema });
const readBody = z.object({ seq: z.number().int().min(0) });

export function conversationsRoutes(services: Services): Router {
  const router = Router();
  const { conversations, messages, receipts } = services;

  router.get(
    '/',
    validate('query', conversationsQuerySchema),
    wrap(async (req, res) => {
      const { cursor, limit } = req.query as unknown as { cursor?: string; limit: number };
      ok(res, await conversations.list(authOf(req).userId, limit, cursor));
    }),
  );
  router.post(
    '/',
    validate('body', createConversationSchema),
    wrap(async (req, res) =>
      ok(res, await conversations.create(authOf(req).userId, req.body), 201),
    ),
  );
  router.get(
    '/:id',
    validate('params', idParams),
    wrap(async (req, res) => ok(res, await conversations.get(req.params.id!, authOf(req).userId))),
  );
  router.patch(
    '/:id',
    validate('params', idParams),
    validate('body', updateConversationSchema),
    wrap(async (req, res) =>
      ok(res, await conversations.update(req.params.id!, authOf(req).userId, req.body)),
    ),
  );
  router.post(
    '/:id/participants',
    validate('params', idParams),
    validate('body', addParticipantsSchema),
    wrap(async (req, res) =>
      ok(
        res,
        await conversations.addParticipants(req.params.id!, authOf(req).userId, req.body.userIds),
      ),
    ),
  );
  router.delete(
    '/:id/participants/:userId',
    validate('params', memberParams),
    wrap(async (req, res) =>
      ok(
        res,
        await conversations.removeParticipant(
          req.params.id!,
          authOf(req).userId,
          req.params.userId!,
        ),
      ),
    ),
  );
  router.post(
    '/:id/leave',
    validate('params', idParams),
    wrap(async (req, res) => {
      await conversations.leave(req.params.id!, authOf(req).userId);
      ok(res, { left: true });
    }),
  );
  router.post(
    '/:id/read',
    validate('params', idParams),
    validate('body', readBody),
    wrap(async (req, res) =>
      ok(res, await receipts.markRead(req.params.id!, authOf(req).userId, req.body.seq)),
    ),
  );

  router.get(
    '/:id/messages',
    validate('params', idParams),
    validate('query', messagesQuerySchema),
    wrap(async (req, res) => {
      const q = req.query as unknown as { beforeSeq?: number; afterSeq?: number; limit: number };
      ok(res, await messages.history(req.params.id!, authOf(req).userId, q));
    }),
  );
  router.post(
    '/:id/messages',
    validate('params', idParams),
    validate('body', messageCreateBodySchema),
    wrap(async (req, res) => {
      // Re-run the cross-field rules of the socket schema with the id from the URL.
      const input = messageSendSchema.parse({ ...req.body, conversationId: req.params.id });
      ok(res, await messages.send(authOf(req).userId, input), 201);
    }),
  );
  return router;
}
