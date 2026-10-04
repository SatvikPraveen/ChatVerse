import { z } from 'zod';
import {
  messageEditSchema,
  messageSendSchema,
  objectIdSchema,
  reactionSchema,
} from '@chatverse/protocol';
import type { EventBinder } from '../validate.js';
import type { GatewayContext, AppSocket } from '../types.js';

const deleteSchema = z.object({ messageId: objectIdSchema });

export function bindMessageHandlers(
  ctx: GatewayContext,
  socket: AppSocket,
  bind: EventBinder,
): void {
  const { messages } = ctx.services;
  const userId = () => socket.data.userId;

  socket.on(
    'message:send',
    bind.ack('message:send', messageSendSchema, async (input) => ({
      message: await messages.send(userId(), input),
    })),
  );
  socket.on(
    'message:edit',
    bind.ack('message:edit', messageEditSchema, async (input) => ({
      message: await messages.edit(userId(), input),
    })),
  );
  socket.on(
    'message:delete',
    bind.ack('message:delete', deleteSchema, async ({ messageId }) => {
      const result = await messages.remove(userId(), messageId);
      return { messageId: result.messageId };
    }),
  );
  socket.on(
    'reaction:toggle',
    bind.ack('reaction:toggle', reactionSchema, async ({ messageId, emoji }) => ({
      message: await messages.toggleReaction(userId(), messageId, emoji),
    })),
  );
}
