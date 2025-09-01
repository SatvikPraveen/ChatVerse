// apps/api/src/realtime/rateLimiter.socket.ts
import { Socket } from 'socket.io';
import { redisHelpers } from '../db/redis.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const SOCKET_RATE_LIMIT = {
  POINTS: env.SOCKET_RATE_LIMIT_POINTS, // 30 points
  DURATION: env.SOCKET_RATE_LIMIT_DURATION, // 60 seconds
};

export async function socketRateLimiter(socket: Socket, next: Function) {
  try {
    const userId = socket.user?.id;
    if (!userId) {
      return next();
    }

    const key = `socket_rate_limit:${userId}`;
    const isAllowed = await redisHelpers.checkRateLimit(
      key,
      SOCKET_RATE_LIMIT.POINTS,
      SOCKET_RATE_LIMIT.DURATION
    );

    if (!isAllowed) {
      logger.warn({ userId }, 'Socket rate limit exceeded');
      socket.emit('rate_limited', {
        retryAfter: SOCKET_RATE_LIMIT.DURATION,
        limit: SOCKET_RATE_LIMIT.POINTS,
        remaining: 0,
      });
      return next(new Error('Rate limit exceeded'));
    }

    next();
  } catch (error) {
    logger.error({ error }, 'Socket rate limiter error');
    next();
  }
}
