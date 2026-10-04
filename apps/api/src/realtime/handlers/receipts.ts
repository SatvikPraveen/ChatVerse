import { receiptSchema } from '@chatverse/protocol';
import type { EventBinder } from '../validate.js';
import type { GatewayContext, AppSocket } from '../types.js';

export function bindReceiptHandlers(ctx: GatewayContext, socket: AppSocket, bind: EventBinder): void {
  const { receipts } = ctx.services;
  socket.on('receipt:delivered', bind.fire('receipt:delivered', receiptSchema, async ({ conversationId, seq }) => {
    await receipts.markDelivered(conversationId, socket.data.userId, seq);
  }));
  socket.on('receipt:read', bind.fire('receipt:read', receiptSchema, async ({ conversationId, seq }) => {
    await receipts.markRead(conversationId, socket.data.userId, seq);
  }));
}
