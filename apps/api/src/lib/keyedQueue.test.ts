import { describe, expect, it } from 'vitest';
import { KeyedQueue } from './keyedQueue.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('KeyedQueue', () => {
  it('serialises tasks with the same key in submission order', async () => {
    const q = new KeyedQueue();
    const order: number[] = [];
    await Promise.all([
      q.run('a', async () => {
        await sleep(20);
        order.push(1);
      }),
      q.run('a', async () => {
        await sleep(1);
        order.push(2);
      }),
      q.run('a', async () => {
        order.push(3);
      }),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('runs different keys concurrently', async () => {
    const q = new KeyedQueue();
    const started = Date.now();
    await Promise.all([
      q.run('a', () => sleep(40)),
      q.run('b', () => sleep(40)),
      q.run('c', () => sleep(40)),
    ]);
    expect(Date.now() - started).toBeLessThan(100);
  });

  it('propagates failures without blocking later tasks and cleans up idle keys', async () => {
    const q = new KeyedQueue();
    const failing = q.run('a', async () => {
      throw new Error('boom');
    });
    const after = q.run('a', async () => 'ok');
    await expect(failing).rejects.toThrow('boom');
    await expect(after).resolves.toBe('ok');
    await sleep(0);
    expect(q.size).toBe(0);
  });
});
