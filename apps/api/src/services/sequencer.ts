import type { Deps } from '../deps.js';
import { ConversationModel } from '../domain/models/index.js';
import { notFound } from '../lib/errors.js';
import { toObjectId } from '../lib/ids.js';

/**
 * Per-conversation sequence number allocator.
 *
 * Correctness requirement: every message in a conversation gets a unique, dense, monotonically
 * increasing `seq`, even when several server nodes accept sends for the same conversation at
 * the same time. Clients rely on density to detect gaps (missing broadcasts) and on monotonicity
 * to order messages without trusting wall clocks.
 *
 * Fast path: Redis `INCR conv:{id}:seq` — atomic across nodes, sub-millisecond. On a cold cache the
 * counter is seeded from MongoDB with `SET NX` so that two nodes seeding concurrently agree.
 * Slow path (Redis unavailable): `findOneAndUpdate { $inc: headSeq }` on the conversation, which
 * is atomic per document. Either way MongoDB's `headSeq` is advanced on write, and the unique
 * index on {conversationId, seq} is the final safety net.
 */
export function createSequencer(deps: Pick<Deps, 'redis' | 'logger'>) {
  const { redis, logger } = deps;
  const key = (conversationId: string) => `conv:${conversationId}:seq`;
  const SEQ_TTL_SEC = 7 * 86_400; // idle conversations drop out of Redis and re-seed from Mongo
  /**
   * Conversations this process has already seeded (or seen INCR succeed for). Lets the hot path
   * skip the EXISTS round trip. Safe because every INCR refreshes the Redis TTL (7 days) while a
   * cache entry lives at most one hour, so a cached key cannot have expired in Redis.
   */
  const SEEDED_TTL_MS = 60 * 60 * 1000;
  const SEEDED_MAX = 50_000;
  const seeded = new Map<string, number>();

  function rememberSeeded(conversationId: string): void {
    if (seeded.size >= SEEDED_MAX) {
      const oldest = seeded.keys().next().value;
      if (oldest !== undefined) seeded.delete(oldest);
    }
    seeded.set(conversationId, Date.now() + SEEDED_TTL_MS);
  }

  function isSeeded(conversationId: string): boolean {
    const until = seeded.get(conversationId);
    if (until === undefined) return false;
    if (until < Date.now()) {
      seeded.delete(conversationId);
      return false;
    }
    return true;
  }

  async function seedFromMongo(conversationId: string): Promise<void> {
    const c = await ConversationModel.findById(toObjectId(conversationId)).select('headSeq');
    if (!c) throw notFound('Conversation');
    await redis.client.set(key(conversationId), String(c.headSeq), 'EX', SEQ_TTL_SEC, 'NX');
  }

  async function viaMongo(conversationId: string): Promise<number> {
    const c = await ConversationModel.findOneAndUpdate(
      { _id: toObjectId(conversationId) },
      { $inc: { headSeq: 1 } },
      { new: true, select: 'headSeq' },
    );
    if (!c) throw notFound('Conversation');
    return c.headSeq;
  }

  return {
    async next(conversationId: string): Promise<number> {
      try {
        const k = key(conversationId);
        if (!isSeeded(conversationId) && !(await redis.client.exists(k)))
          await seedFromMongo(conversationId);
        // One round trip: INCR and TTL refresh are pipelined in a MULTI block.
        const replies = await redis.client.multi().incr(k).expire(k, SEQ_TTL_SEC).exec();
        const incrReply = replies?.[0];
        if (!incrReply || incrReply[0])
          throw incrReply?.[0] ?? new Error('sequencer: empty MULTI reply');
        rememberSeeded(conversationId);
        return Number(incrReply[1]);
      } catch (err) {
        seeded.delete(conversationId);
        logger.warn({ err, conversationId }, 'sequencer: redis unavailable, falling back to mongo');
        return viaMongo(conversationId);
      }
    },

    /** Forget the cached counter (tests / administrative resets). */
    async reset(conversationId: string): Promise<void> {
      seeded.delete(conversationId);
      await redis.client.del(key(conversationId));
    },
  };
}

export type Sequencer = ReturnType<typeof createSequencer>;
