import { ErrorCode, ROOMS, joinConversationSchema } from '@chatverse/protocol';
import { AppError } from '../../lib/errors.js';
import type { EventBinder } from '../validate.js';
import type { GatewayContext, AppSocket } from '../types.js';

/**
 * Sockets are auto-joined to every conversation room at connect time, so `conversation:join` is
 * mostly a way for a client to confirm membership and learn the current head sequence number
 * (the starting point for gap detection). `leave` only affects this socket's subscription.
 */
export function bindConversationHandlers(
  ctx: GatewayContext,
  socket: AppSocket,
  bind: EventBinder,
): void {
  socket.on(
    'conversation:join',
    bind.ack('conversation:join', joinConversationSchema, async ({ conversationId }) => {
      const c = await ctx.services.conversations.loadForMember(conversationId, socket.data.userId);
      await socket.join(ROOMS.conversation(conversationId));
      return { headSeq: c.headSeq };
    }),
  );

  socket.on(
    'conversation:leave',
    bind.fire('conversation:leave', joinConversationSchema, async ({ conversationId }) => {
      if (!socket.rooms.has(ROOMS.conversation(conversationId)))
        throw new AppError(ErrorCode.NOT_FOUND, 'Not subscribed to that conversation');
      await socket.leave(ROOMS.conversation(conversationId));
    }),
  );
}
