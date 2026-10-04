import { ROOMS, typingSchema } from '@chatverse/protocol';
import type { EventBinder } from '../validate.js';
import type { GatewayContext, AppSocket } from '../types.js';

/**
 * Typing indicators are ephemeral: relayed to the conversation room (excluding the sender) and
 * never persisted. Membership is enforced by room subscription, which only members can obtain.
 */
export function bindTypingHandlers(_ctx: GatewayContext, socket: AppSocket, bind: EventBinder): void {
  socket.on('typing', bind.fire('typing', typingSchema, async ({ conversationId, isTyping }) => {
    const room = ROOMS.conversation(conversationId);
    if (!socket.rooms.has(room)) return;
    socket.to(room).emit('typing', { conversationId, userId: socket.data.userId, isTyping });
  }));
}
