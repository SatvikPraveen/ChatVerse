// apps/api/src/db/redis.ts
import { createClient, RedisClientType } from 'redis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export let redis: RedisClientType;

export async function connectToRedis() {
  try {
    redis = createClient({
      url: env.REDIS_URL,
      socket: {
        connectTimeout: 5000,
        lazyConnect: true,
      },
      retry_delay_on_failover: 100,
      retry_delay_on_cluster_down: 300,
    });

    redis.on('connect', () => {
      logger.info('Connecting to Redis');
    });

    redis.on('ready', () => {
      logger.info('Redis connection ready');
    });

    redis.on('error', (error) => {
      logger.error({ error }, 'Redis connection error');
    });

    redis.on('end', () => {
      logger.warn('Redis connection ended');
    });

    redis.on('reconnecting', () => {
      logger.info('Reconnecting to Redis');
    });

    await redis.connect();

    // Test the connection
    await redis.ping();

    logger.info('Redis connection established successfully');
  } catch (error) {
    logger.fatal({ error }, 'Failed to connect to Redis');
    throw error;
  }
}

// Redis helper functions
export const redisHelpers = {
  // Session management
  async setSession(sessionId: string, data: any, ttl: number = 3600) {
    await redis.setEx(`session:${sessionId}`, ttl, JSON.stringify(data));
  },

  async getSession(sessionId: string) {
    const data = await redis.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  },

  async deleteSession(sessionId: string) {
    await redis.del(`session:${sessionId}`);
  },

  // Rate limiting
  async checkRateLimit(key: string, limit: number, window: number) {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, window);
    }
    return current <= limit;
  },

  // Presence tracking
  async setUserPresence(userId: string, status: string, ttl: number = 300) {
    await redis.setEx(`presence:${userId}`, ttl, JSON.stringify({
      status,
      lastSeen: new Date().toISOString()
    }));
  },

  async getUserPresence(userId: string) {
    const data = await redis.get(`presence:${userId}`);
    return data ? JSON.parse(data) : null;
  },

  // Typing indicators
  async setTyping(conversationId: string, userId: string, ttl: number = 5) {
    await redis.setEx(`typing:${conversationId}:${userId}`, ttl, '1');
  },

  async getTypingUsers(conversationId: string) {
    const keys = await redis.keys(`typing:${conversationId}:*`);
    return keys.map(key => key.split(':')[2]);
  },

  // Cache management
  async setCache(key: string, data: any, ttl: number = 3600) {
    await redis.setEx(`cache:${key}`, ttl, JSON.stringify(data));
  },

  async getCache(key: string) {
    const data = await redis.get(`cache:${key}`);
    return data ? JSON.parse(data) : null;
  },

  async deleteCache(key: string) {
    await redis.del(`cache:${key}`);
  },

  async invalidatePattern(pattern: string) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(keys);
    }
  }
};
