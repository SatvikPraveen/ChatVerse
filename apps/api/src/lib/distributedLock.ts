import { randomUUID } from 'node:crypto';
import type { RedisClient } from '../infra/redis.js';

/**
 * Minimal single-instance Redis lock (SET NX PX + compare-and-delete release).
 *
 * Used to extend the per-conversation "allocate seq → persist → emit" critical section across
 * server nodes. Without it, two nodes can allocate seq 5 and 6 for the same conversation and
 * broadcast them in the order 6, 5 (measured: ~3% of deliveries in a two-node cluster, see
 * docs/EVALUATION.md). With it, broadcasts leave the cluster in seq order; the Redis pub/sub hop
 * of the Socket.IO adapter is then the only remaining source of reordering, and it is orders of
 * magnitude faster than a message insert.
 *
 * This is deliberately not Redlock: a single Redis is already the coordination point for
 * sequencing, so a multi-master lock would add cost without adding safety. If the lock is lost
 * (Redis failover, TTL expiry on a stalled node) the unique {conversationId, seq} index still
 * guarantees correctness; only emission order may degrade.
 */

const RELEASE_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0`;

export interface LockOptions {
  /** How long the lock may be held before Redis expires it (protects against dead holders). */
  ttlMs?: number;
  /** How long to wait for the lock before giving up and running unlocked. */
  waitMs?: number;
  /** Base delay between acquisition attempts; jittered. */
  retryMs?: number;
}

export class DistributedLock {
  constructor(
    private readonly redis: RedisClient,
    private readonly prefix = 'lock',
  ) {}

  /**
   * Run `fn` while holding the lock for `key`. If the lock cannot be acquired within `waitMs`
   * the function still runs (availability over strict ordering) and `acquired` is false.
   */
  async withLock<T>(
    key: string,
    fn: (acquired: boolean) => Promise<T>,
    opts: LockOptions = {},
  ): Promise<T> {
    const ttlMs = opts.ttlMs ?? 2_000;
    const waitMs = opts.waitMs ?? ttlMs;
    const retryMs = opts.retryMs ?? 2;
    const redisKey = `${this.prefix}:${key}`;
    const token = randomUUID();
    const deadline = Date.now() + waitMs;

    let acquired = false;
    for (;;) {
      const reply = await this.redis.set(redisKey, token, 'PX', ttlMs, 'NX');
      if (reply === 'OK') {
        acquired = true;
        break;
      }
      if (Date.now() >= deadline) break;
      await sleep(retryMs + Math.random() * retryMs);
    }

    try {
      return await fn(acquired);
    } finally {
      if (acquired) {
        try {
          await this.redis.eval(RELEASE_SCRIPT, 1, redisKey, token);
        } catch {
          // The TTL will release it; nothing more to do.
        }
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
