// apps/api/src/realtime/io.ts
import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import { redis } from '../db/redis.js';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { socketRateLimiter } from './rateLimiter.socket.js';
import { setupChatEvents } from './events.chat.js';
import { setupPresenceEvents } from './events.presence.js';
import type { ClientToServerEvents, ServerToClientEvents } from '@chatverse/types';

export let io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>;

interface SocketUser {
  id: string;
  email: string;
  name: string;
}

declare module 'socket.io' {
  interface Socket {
    user?: SocketUser;
  }
}

export function createSocketServer(httpServer: HttpServer) {
  io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: env.CORS_ORIGINS,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  // Setup Redis adapter for horizontal scaling
  const pubClient = redis.duplicate();
  const subClient = redis.duplicate();

  io.adapter(createAdapter(pubClient, subClient));

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, env.JWT_SECRET) as {
        userId: string;
        email: string;
      };

      // Get user from database
      const user = await User.findById(decoded.userId);
      if (!user || !user.isActive) {
        return next(new Error('Invalid user'));
      }

      // Attach user to socket
      socket.user = {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
      };

      next();
    } catch (error) {
      logger.error({ error }, 'Socket authentication failed');
      next(new Error('Authentication failed'));
    }
  });

  // Rate limiting middleware
  io.use(socketRateLimiter);

  // Connection handler
  io.on('connection', async (socket) => {
    const user = socket.user!;

    logger.info({
      userId: user.id,
      socketId: socket.id
    }, 'User connected to socket');

    // Update user presence
    await User.findByIdAndUpdate(user.id, {
      'presence.status': 'online',
      'presence.lastSeen': new Date()
    });

    // Join user to personal room for notifications
    socket.join(`user:${user.id}`);

    // Setup event handlers
    setupChatEvents(socket);
    setupPresenceEvents(socket);

    // Handle disconnect
    socket.on('disconnect', async (reason) => {
      logger.info({
        userId: user.id,
        socketId: socket.id,
        reason
      }, 'User disconnected from socket');

      // Update user presence to offline
      await User.findByIdAndUpdate(user.id, {
        'presence.status': 'offline',
        'presence.lastSeen': new Date()
      });

      // Broadcast offline status
      socket.broadcast.emit('user:offline', {
        userId: user.id,
        lastSeen: new Date()
      });
    });

    // Emit authenticated event
    socket.emit('auth:authenticated');

    // Broadcast online status
    socket.broadcast.emit('user:online', {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: undefined,
        presence: {
          status: 'online',
          lastSeen: new Date()
        },
        settings: {
          notifications: { push: true, email: true, sound: false },
          privacy: { showOnlineStatus: true, allowMessageRequests: true },
          theme: 'system'
        },
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
  });

  logger.info('Socket.IO server initialized');
  return io;
}

export { io };
