import type { ReceiptUpdate } from '@chatverse/protocol';
import type { Deps } from '../deps.js';
import { ConversationModel, findParticipant } from '../domain/models/index.js';
import { toObjectId } from '../lib/ids.js';
import type { ConversationsService } from './conversations.service.js';

/**
 * Delivery and read receipts as per-participant high-water marks.
 *
 * A receipt "read up to seq N" implies every message ≤ N is read, so one number per participant
 * replaces a per-message readBy array. Updates are monotonic: `$max` guarantees that a late or
 * duplicated receipt can never move a watermark backwards, and `lastDeliveredSeq` is lifted along
 * with `lastReadSeq` because reading implies delivery. Watermarks are clamped to headSeq so a
 * client cannot claim to have read the future.
 */
export function createReceiptsService(deps: Pick<Deps, 'hub'>, conversations: ConversationsService) {
  const { hub } = deps;

  async function advance(conversationId: string, userId: string, seq: number, field: 'lastDeliveredSeq' | 'lastReadSeq'): Promise<ReceiptUpdate | null> {
    const c = await conversations.loadForMember(conversationId, userId);
    const clamped = Math.min(seq, c.headSeq);
    const $max: Record<string, number> = { 'participants.$.lastDeliveredSeq': clamped };
    if (field === 'lastReadSeq') $max['participants.$.lastReadSeq'] = clamped;
    const updated = await ConversationModel.findOneAndUpdate(
      { _id: toObjectId(conversationId), 'participants.userId': toObjectId(userId) },
      { $max },
      { new: true, timestamps: false },
    );
    if (!updated) return null;
    const p = findParticipant(updated, userId)!;
    const before = findParticipant(c, userId)!;
    if (p.lastDeliveredSeq === before.lastDeliveredSeq && p.lastReadSeq === before.lastReadSeq) return null; // nothing moved
    const update: ReceiptUpdate = { conversationId, userId, lastDeliveredSeq: p.lastDeliveredSeq, lastReadSeq: p.lastReadSeq };
    hub.toConversation(conversationId, 'receipt:updated', update);
    return update;
  }

  return {
    markDelivered: (conversationId: string, userId: string, seq: number) => advance(conversationId, userId, seq, 'lastDeliveredSeq'),
    markRead: (conversationId: string, userId: string, seq: number) => advance(conversationId, userId, seq, 'lastReadSeq'),
  };
}

export type ReceiptsService = ReturnType<typeof createReceiptsService>;
