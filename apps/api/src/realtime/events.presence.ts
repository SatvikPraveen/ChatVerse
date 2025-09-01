// apps/api/src/realtime/events.presence.ts
import { Socket } from 'socket.io';
import { User } from '../models/User.js';
import { redisHelpers } from '../db/redis.js';
import { logger } from '../utils/logger.js';
import { io } from './io.js';
import type { PresenceEvent, TypingEvent } from '@chatverse/types';

const TYPING_TIMEOUT = 3000; // 3 seconds
const PRESENCE_UPDATE_INTERVAL = 30000; // 30 seconds

export function setupPresenceEvents(socket: Socket) {
  const user = socket.user!;
  let typingTimeouts = new Map<string, NodeJS.Timeout>();
  let presenceInterval: NodeJS.Timeout;

  // Handle typing start
  socket.on('typing:start', async (data: TypingEvent) => {
    try {
      const { conversationId } = data;

      // Set typing indicator in Redis
      await redisHelpers.setTyping(conversationId, user.id, TYPING_TIMEOUT / 1000);

      // Broadcast typing start to conversation participants
      socket.to(`conversation:${conversationId}`).emit('typing:start', {
        conversationId,
        userId: user.id,
        userName: user.name,
      });

      // Clear existing timeout for this conversation
      const existingTimeout = typingTimeouts.get(conversationId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      // Set timeout to automatically stop typing
      const timeout = setTimeout(async () => {
        try {
          await redisHelpers.deleteCache(`typing:${conversationId}:${user.id}`);

          socket.to(`conversation:${conversationId}`).emit('typing:stop', {
            conversationId,
            userId: user.id,
            userName: user.name,
          });

          typingTimeouts.delete(conversationId);
        } catch (error) {
          logger.error({ error, userId: user.id, conversationId }, 'Failed to auto-stop typing');
        }
      }, TYPING_TIMEOUT);

      typingTimeouts.set(conversationId, timeout);

      logger.debug({ userId: user.id, conversationId }, 'User started typing');
    } catch (error) {
      logger.error({ error, userId: user.id }, 'Failed to handle typing start');
    }
  });

  // Handle typing stop
  socket.on('typing:stop', async (data: TypingEvent) => {
    try {
      const { conversationId } = data;

      // Remove typing indicator from Redis
      await redisHelpers.deleteCache(`typing:${conversationId}:${user.id}`);

      // Broadcast typing stop to conversation participants
      socket.to(`conversation:${conversationId}`).emit('typing:stop', {
        conversationId,
        userId: user.id,
        userName: user.name,
      });

      // Clear timeout for this conversation
      const existingTimeout = typingTimeouts.get(conversationId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        typingTimeouts.delete(conversationId);
      }

      logger.debug({ userId: user.id, conversationId }, 'User stopped typing');
    } catch (error) {
      logger.error({ error, userId: user.id }, 'Failed to handle typing stop');
    }
  });

  // Handle presence update
  socket.on('presence:update', async (data: PresenceEvent) => {
    try {
      const { status } = data;
      const validStatuses = ['online', 'away', 'busy', 'offline'];

      if (!validStatuses.includes(status)) {
        socket.emit('error', {
          code: 'INVALID_PRESENCE_STATUS',
          message: 'Invalid presence status',
        });
        return;
      }

      // Update user presence in database
      await User.findByIdAndUpdate(user.id, {
        'presence.status': status,
        'presence.lastSeen': new Date(),
      });

      // Update presence in Redis
      await redisHelpers.setUserPresence(user.id, status);

      // Broadcast presence update to all connected clients
      socket.broadcast.emit('presence:update', {
        userId: user.id,
        status,
        lastSeen: new Date(),
      });

      logger.debug({ userId: user.id, status }, 'User presence updated');
    } catch (error) {
      logger.error({ error, userId: user.id }, 'Failed to update presence');
    }
  });

  // Periodic presence heartbeat
  presenceInterval = setInterval(async () => {
    try {
      // Update last seen timestamp
      await User.findByIdAndUpdate(user.id, {
        'presence.lastSeen': new Date(),
      });

      // Refresh presence in Redis
      await redisHelpers.setUserPresence(user.id, 'online');
    } catch (error) {
      logger.error({ error, userId: user.id }, 'Failed to update presence heartbeat');
    }
  }, PRESENCE_UPDATE_INTERVAL);

  // Handle disconnect cleanup
  socket.on('disconnect', async () => {
    try {
      // Clear all typing timeouts
      typingTimeouts.forEach((timeout) => clearTimeout(timeout));
      typingTimeouts.clear();

      // Clear presence interval
      if (presenceInterval) {
        clearInterval(presenceInterval);
      }

      // Set user offline
      await User.findByIdAndUpdate(user.id, {
        'presence.status': 'offline',
        'presence.lastSeen': new Date(),
      });

      // Remove presence from Redis
      await redisHelpers.setUserPresence(user.id, 'offline');

      // Clean up typing indicators
      const typingKeys = await redisHelpers.redis.keys(`typing:*:${user.id}`);
      if (typingKeys.length > 0) {
        await redisHelpers.redis.del(typingKeys);
      }

      logger.debug({ userId: user.id }, 'Presence cleanup completed on disconnect');
    } catch (error) {
      logger.error({ error, userId: user.id }, 'Failed to cleanup presence on disconnect');
    }
  });
}

// Utility function to get online users
export async function getOnlineUsers(): Promise<string[]> {
  try {
    const keys = await redisHelpers.redis.keys('presence:*');
    const onlineUsers: string[] = [];

    for (const key of keys) {
      const presence = await redisHelpers.redis.get(key);
      if (presence) {
        const data = JSON.parse(presence);
        if (data.status === 'online') {
          const userId = key.replace('presence:', '');
          onlineUsers.push(userId);
        }
      }
    }

    return onlineUsers;
  } catch (error) {
    logger.error({ error }, 'Failed to get online users');
    return [];
  }
}

// Utility function to get user presence
export async function getUserPresence(userId: string) {
  try {
    return await redisHelpers.getUserPresence(userId);
  } catch (error) {
    logger.error({ error, userId }, 'Failed to get user presence');
    return null;
  }
}

// Cleanup stale presence data (run periodically)
export async function cleanupStalePresence() {
  try {
    const keys = await redisHelpers.redis.keys('presence:*');
    const staleKeys: string[] = [];

    for (const key of keys) {
      const presence = await redisHelpers.redis.get(key);
      if (presence) {
        const data = JSON.parse(presence);
        const lastSeen = new Date(data.lastSeen);
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

        if (lastSeen < fiveMinutesAgo) {
          staleKeys.push(key);
        }
      }
    }

    if (staleKeys.length > 0) {
      await redisHelpers.redis.del(staleKeys);
      logger.info({ count: staleKeys.length }, 'Cleaned up stale presence data');
    }
  } catch (error) {
    logger.error({ error }, 'Failed to cleanup stale presence');
  }
}

// Schedule periodic cleanup (run every 5 minutes)
setInterval(cleanupStalePresence, 5 * 60 * 1000);
