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
        if (!(await redis.client.exists(k))) await seedFromMongo(conversationId);
        const seq = await redis.client.incr(k);
        await redis.client.expire(k, SEQ_TTL_SEC);
        return seq;
      } catch (err) {
        logger.warn({ err, conversationId }, 'sequencer: redis unavailable, falling back to mongo');
        return viaMongo(conversationId);
      }
    },

    /** Forget the cached counter (tests / administrative resets). */
    async reset(conversationId: string): Promise<void> {
      await redis.client.del(key(conversationId));
    },
  };
}

export type Sequencer = ReturnType<typeof createSequencer>;
