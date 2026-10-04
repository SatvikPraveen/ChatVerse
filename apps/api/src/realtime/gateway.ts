import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { Server } from 'socket.io';
import { ErrorCode, PROTOCOL_VERSION, ROOMS, deviceIdSchema } from '@chatverse/protocol';
import type { Deps } from '../deps.js';
import { AppError } from '../lib/errors.js';
import { randomToken } from '../lib/ids.js';
import type { Services } from '../services/index.js';
import { bindConversationHandlers } from './handlers/conversations.js';
import { bindMessageHandlers } from './handlers/messages.js';
import { bindPresenceHandlers } from './handlers/presence.js';
import { bindReceiptHandlers } from './handlers/receipts.js';
import { bindSyncHandlers } from './handlers/sync.js';
import { bindTypingHandlers } from './handlers/typing.js';
import type { IoServer } from './hub.js';
import type { GatewayContext } from './types.js';
import { createBinder } from './validate.js';

export interface Gateway {
  io: IoServer;
  close(): Promise<void>;
}

/**
 * Socket.IO gateway.
 *
 * Authentication happens once per connection in the handshake (access JWT in `auth.token`), after
 * which the socket joins its user room and every conversation room it belongs to. All fan-out in
 * the system is room-based, which makes it transparent to the Redis adapter: a message accepted
 * on node A reaches a recipient connected to node B without any application-level routing.
 */
export function createGateway(httpServer: HttpServer, deps: Deps, services: Services): Gateway {
  const io: IoServer = new Server(httpServer, {
    cors: { origin: deps.env.CORS_ORIGINS, credentials: true },
    transports: ['websocket', 'polling'],
    pingInterval: 20_000,
    pingTimeout: 15_000,
    maxHttpBufferSize: 256 * 1024,
    serveClient: false,
  });

  // Fan-out pub/sub can live on its own Redis (REDIS_ADAPTER_URL) so adapter bandwidth never
  // competes with the coordination keys (sequencing, locks, presence, rate limits).
  let pub: ReturnType<Deps['redis']['duplicate']> | null = null;
  let sub: ReturnType<Deps['redis']['duplicate']> | null = null;
  if (deps.redis.shared) {
    if (deps.env.REDIS_ADAPTER_URL) {
      pub = new Redis(deps.env.REDIS_ADAPTER_URL, { maxRetriesPerRequest: null });
      sub = pub.duplicate();
      deps.logger.info('socket.io adapter on dedicated redis');
    } else {
      pub = deps.redis.duplicate();
      sub = deps.redis.duplicate();
    }
    io.adapter(createAdapter(pub, sub));
  }

  const ctx: GatewayContext = { io, deps, services };
  deps.hub.bind(io);

  io.use(async (socket, next) => {
    try {
      const auth = socket.handshake.auth as { token?: unknown; deviceId?: unknown };
      if (typeof auth.token !== 'string')
        throw new AppError(ErrorCode.UNAUTHENTICATED, 'Missing auth.token');
      const claims = services.auth.tokens.verifyAccess(auth.token);
      if (!(await services.auth.tokens.isSessionActive(claims.sid)))
        throw new AppError(ErrorCode.TOKEN_INVALID, 'Session revoked');
      const device = deviceIdSchema.safeParse(auth.deviceId);
      socket.data = {
        userId: claims.sub,
        deviceId: device.success ? device.data : claims.did,
        sessionId: claims.sid,
      };
      next();
    } catch (err) {
      const appErr = err instanceof AppError ? err : new AppError(ErrorCode.UNAUTHENTICATED);
      const e = new Error(appErr.message) as Error & { data?: unknown };
      e.data = appErr.toApiError();
      next(e);
    }
  });

  io.on('connection', async (socket) => {
    const { userId } = socket.data;
    const { logger, metrics } = deps;
    metrics.socketConnections.inc({ node: deps.env.NODE_ID });
    socket.data.sessionId ||= randomToken(8);

    const bind = createBinder(ctx, socket);
    bindConversationHandlers(ctx, socket, bind);
    bindMessageHandlers(ctx, socket, bind);
    bindReceiptHandlers(ctx, socket, bind);
    bindTypingHandlers(ctx, socket, bind);
    bindPresenceHandlers(ctx, socket, bind);
    bindSyncHandlers(ctx, socket, bind);

    socket.on('disconnect', (reason) => {
      metrics.socketConnections.dec({ node: deps.env.NODE_ID });
      services.presence
        .disconnect(userId, socket.id)
        .catch((err) => logger.warn({ err, userId }, 'presence disconnect failed'));
      services.users.touchLastSeen(userId).catch(() => undefined);
      logger.debug({ userId, socketId: socket.id, reason }, 'socket disconnected');
    });

    try {
      const [user, conversationIds] = await Promise.all([
        services.users.me(userId),
        services.conversations.listIdsForUser(userId),
      ]);
      await socket.join([ROOMS.user(userId), ...conversationIds.map(ROOMS.conversation)]);
      await services.presence.connect(userId, socket.id);
      services.keys.touch(userId, socket.data.deviceId).catch(() => undefined);
      socket.emit('session:ready', {
        user,
        serverTime: new Date().toISOString(),
        hlc: deps.clock.tick(),
        nodeId: deps.env.NODE_ID,
        protocolVersion: PROTOCOL_VERSION,
      });
      logger.debug(
        { userId, socketId: socket.id, rooms: conversationIds.length },
        'socket connected',
      );
    } catch (err) {
      logger.error({ err, userId }, 'socket setup failed');
      socket.emit(
        'protocol:error',
        (err instanceof AppError ? err : new AppError(ErrorCode.INTERNAL)).toApiError(),
      );
      socket.disconnect(true);
    }
  });

  return {
    io,
    async close() {
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await Promise.all([pub?.quit().catch(() => undefined), sub?.quit().catch(() => undefined)]);
    },
  };
}
