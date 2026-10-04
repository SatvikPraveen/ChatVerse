import { syncPullSchema } from '@chatverse/protocol';
import type { EventBinder } from '../validate.js';
import type { GatewayContext, AppSocket } from '../types.js';

/**
 * Gap recovery. A client that sees seq N+2 after N (or reconnects) asks for everything after the
 * last seq it has; the server answers from the (conversationId, seq) index. Because seqs are
 * dense, the client can tell exactly when it has caught up (headSeq) without any timestamps.
 */
export function bindSyncHandlers(ctx: GatewayContext, socket: AppSocket, bind: EventBinder): void {
  socket.on('sync:pull', bind.ack('sync:pull', syncPullSchema, async ({ conversationId, afterSeq, limit }) =>
    ctx.services.messages.sync(conversationId, socket.data.userId, afterSeq, limit as number),
  ));
}
