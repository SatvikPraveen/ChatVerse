import Redis from 'ioredis';
import type { Env } from '../config/env.js';
import type { Logger } from './logger.js';

/**
 * Redis client factory.
 *
 * In production every node talks to the same Redis, which is what makes sequence numbers,
 * presence, rate limits and Socket.IO fan-out consistent across nodes. When REDIS_URL is not
 * configured (local development without Redis, or the test suite) we fall back to
 * `ioredis-mock`: a faithful in-process implementation of the same command set, so all of the
 * Redis-dependent code paths are still exercised, just on a single node.
 */
export type RedisClient = Redis;

export interface RedisHandle {
  client: RedisClient;
  /** True when backed by a real Redis server (enables the Socket.IO redis adapter). */
  shared: boolean;
  /** Create another connection (needed for pub/sub, which blocks a connection). */
  duplicate(): RedisClient;
  close(): Promise<void>;
}

export async function createRedis(env: Pick<Env, 'REDIS_URL' | 'NODE_ENV'>, logger: Logger): Promise<RedisHandle> {
  if (!env.REDIS_URL || env.NODE_ENV === 'test') {
    if (env.NODE_ENV === 'production') {
      throw new Error('REDIS_URL is required in production (the in-process emulator is dev/test only)');
    }
    const { default: RedisMock } = await import('ioredis-mock');
    const client = new RedisMock() as unknown as Redis;
    if (env.NODE_ENV !== 'test') logger.warn('REDIS_URL not set: using in-process Redis emulation (single node only)');
    return {
      client,
      shared: false,
      duplicate: () => (client as unknown as { duplicate(): Redis }).duplicate(),
      close: async () => {
        await client.flushall();
        client.disconnect();
      },
    };
  }

  const client = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3, enableReadyCheck: true });
  client.on('error', (err) => logger.error({ err }, 'redis error'));
  client.on('reconnecting', () => logger.warn('redis reconnecting'));
  await client.connect();
  logger.info('redis connected');
  return {
    client,
    shared: true,
    duplicate: () => client.duplicate(),
    close: async () => {
      await client.quit();
    },
  };
}

export async function pingRedis(client: RedisClient): Promise<number> {
  const started = performance.now();
  await client.ping();
  return Math.round((performance.now() - started) * 100) / 100;
}
