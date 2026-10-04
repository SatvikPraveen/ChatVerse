import RedisMock from 'ioredis-mock';
import { describe, expect, it } from 'vitest';
import type { RedisClient } from '../infra/redis.js';
import { DistributedLock } from './distributedLock.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('DistributedLock', () => {
  it('serialises holders of the same key across "nodes" sharing one Redis', async () => {
    const redis = new RedisMock() as unknown as RedisClient;
    const nodeA = new DistributedLock(redis);
    const nodeB = new DistributedLock(redis);
    const order: string[] = [];
    await Promise.all([
      nodeA.withLock('conv:1', async (acquired) => {
        expect(acquired).toBe(true);
        order.push('a-start');
        await sleep(30);
        order.push('a-end');
      }),
      (async () => {
        await sleep(5);
        await nodeB.withLock('conv:1', async (acquired) => {
          expect(acquired).toBe(true);
          order.push('b-start');
          order.push('b-end');
        });
      })(),
    ]);
    expect(order).toEqual(['a-start', 'a-end', 'b-start', 'b-end']);
    expect(await redis.get('lock:conv:1')).toBeNull();
  });

  it('does not block different keys', async () => {
    const redis = new RedisMock() as unknown as RedisClient;
    const lock = new DistributedLock(redis);
    const started = Date.now();
    await Promise.all([lock.withLock('x', () => sleep(40)), lock.withLock('y', () => sleep(40))]);
    expect(Date.now() - started).toBeLessThan(80);
  });

  it('falls through unlocked after waitMs and never releases a lock it does not own', async () => {
    const redis = new RedisMock() as unknown as RedisClient;
    const lock = new DistributedLock(redis);
    await redis.set('lock:busy', 'someone-else', 'PX', 500);
    const acquired = await lock.withLock('busy', async (a) => a, { waitMs: 20, retryMs: 2 });
    expect(acquired).toBe(false);
    expect(await redis.get('lock:busy')).toBe('someone-else');
  });

  it('releases the lock even when the task throws', async () => {
    const redis = new RedisMock() as unknown as RedisClient;
    const lock = new DistributedLock(redis);
    await expect(
      lock.withLock('k', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await redis.get('lock:k')).toBeNull();
  });
});
