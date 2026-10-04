import {
  ErrorCode,
  LIMITS,
  type Message,
  type MessageEditValidated,
  type MessageSendValidated,
  type MessagesResponse,
  type SyncPullResult,
} from '@chatverse/protocol';
import type { Deps } from '../deps.js';
import {
  AttachmentModel,
  ConversationModel,
  MessageModel,
  findParticipant,
  toMessage,
  type AttachmentEmbed,
  type ConversationDoc,
  type MessageDoc,
  type MessageDocument,
} from '../domain/models/index.js';
import { AppError, forbidden, isDuplicateKeyError, notFound } from '../lib/errors.js';
import { toObjectId } from '../lib/ids.js';
import type { ConversationsService } from './conversations.service.js';
import type { PushService } from './push.service.js';
import type { Sequencer } from './sequencer.js';

const ROLE_RANK = { member: 0, admin: 1, owner: 2 } as const;

export function createMessagesService(
  deps: Pick<Deps, 'hub' | 'clock' | 'metrics' | 'logger'>,
  conversations: ConversationsService,
  sequencer: Sequencer,
  push?: PushService,
) {
  const { hub, clock, metrics } = deps;

  async function loadMessage(messageId: string): Promise<MessageDocument> {
    const m = await MessageModel.findById(toObjectId(messageId));
    if (!m) throw notFound('Message');
    return m;
  }

  async function resolveAttachments(ownerId: string, ids: string[] | undefined): Promise<AttachmentEmbed[]> {
    if (!ids?.length) return [];
    const docs = await AttachmentModel.find({ _id: { $in: ids.map(toObjectId) }, ownerId: toObjectId(ownerId), status: 'ready' });
    if (docs.length !== new Set(ids).size) throw new AppError(ErrorCode.VALIDATION_ERROR, 'Unknown or not-yet-uploaded attachment', { attachmentIds: 'invalid' });
    return docs.map((d) => ({ id: d._id, name: d.name, size: d.size, mimeType: d.mimeType, url: d.url }));
  }

  function enforceEncryptionPolicy(c: ConversationDoc, kind: string): void {
    if (c.encrypted && kind !== 'encrypted') throw new AppError(ErrorCode.ENCRYPTION_REQUIRED, 'This conversation requires end-to-end encrypted messages');
    if (!c.encrypted && kind === 'encrypted') throw new AppError(ErrorCode.PLAINTEXT_NOT_ALLOWED, 'This conversation is not end-to-end encrypted');
  }

  function broadcastUpdated(m: MessageDoc): Message {
    const msg = toMessage(m);
    hub.toConversation(msg.conversationId, 'message:updated', { message: msg });
    return msg;
  }

  return {
    /**
     * Accept a message. Idempotent on (conversationId, senderId, clientMsgId): a retry after a
     * lost ack returns the original message with its original seq instead of creating a duplicate.
     */
    async send(senderId: string, input: MessageSendValidated): Promise<Message> {
      const c = await conversations.loadForMember(input.conversationId, senderId);
      enforceEncryptionPolicy(c, input.kind);

      const existing = await MessageModel.findOne({ conversationId: c._id, senderId: toObjectId(senderId), clientMsgId: input.clientMsgId });
      if (existing) return toMessage(existing);

      if (input.replyTo) {
        const parent = await MessageModel.findOne({ _id: toObjectId(input.replyTo), conversationId: c._id }).select('_id');
        if (!parent) throw new AppError(ErrorCode.VALIDATION_ERROR, 'replyTo must reference a message in the same conversation', { replyTo: 'invalid' });
      }
      const attachments = await resolveAttachments(senderId, input.attachmentIds);

      const started = performance.now();
      const seq = await sequencer.next(input.conversationId);
      let doc: MessageDoc;
      try {
        doc = await MessageModel.create({
          conversationId: c._id,
          seq,
          clientMsgId: input.clientMsgId,
          senderId: toObjectId(senderId),
          kind: input.kind,
          text: input.kind === 'encrypted' ? null : (input.text ?? null),
          encrypted: input.encrypted ?? null,
          attachments,
          replyTo: input.replyTo ? toObjectId(input.replyTo) : null,
          hlc: clock.tick(),
        });
      } catch (err) {
        if (isDuplicateKeyError(err) && err.keyPattern?.clientMsgId) {
          // Lost the race with our own retry: return whichever insert won.
          const winner = await MessageModel.findOne({ conversationId: c._id, senderId: toObjectId(senderId), clientMsgId: input.clientMsgId });
          if (winner) return toMessage(winner);
        }
        throw err;
      }

      // headSeq only moves forward; $max makes concurrent writers converge regardless of order.
      await ConversationModel.updateOne(
        { _id: c._id, $or: [{ headSeq: { $lt: seq } }, { 'lastMessage.seq': { $lt: seq } }, { lastMessage: null }] },
        {
          $max: { headSeq: seq },
          $set: {
            lastMessage: { id: doc._id, seq, senderId: doc.senderId, kind: doc.kind, text: doc.kind === 'encrypted' ? null : doc.text, createdAt: doc.createdAt },
            updatedAt: doc.createdAt,
          },
        },
        { timestamps: false },
      );

      const message = toMessage(doc);
      hub.toConversation(message.conversationId, 'message:new', { message });
      metrics.messagesSent.inc({ kind: message.kind });
      metrics.messageFanoutDuration.observe((performance.now() - started) / 1000);
      push?.notifyNewMessage(c, message).catch((err) => deps.logger.warn({ err }, 'push notification failed'));
      return message;
    },

    /** History (beforeSeq, newest first → returned oldest first) or catch-up (afterSeq, oldest first). */
    async history(conversationId: string, userId: string, q: { beforeSeq?: number; afterSeq?: number; limit: number }): Promise<MessagesResponse> {
      const c = await conversations.loadForMember(conversationId, userId);
      const filter: Record<string, unknown> = { conversationId: c._id };
      let docs: MessageDoc[];
      if (q.afterSeq !== undefined) {
        filter.seq = { $gt: q.afterSeq };
        docs = await MessageModel.find(filter).sort({ seq: 1 }).limit(q.limit + 1);
      } else {
        if (q.beforeSeq !== undefined) filter.seq = { $lt: q.beforeSeq };
        docs = await MessageModel.find(filter).sort({ seq: -1 }).limit(q.limit + 1);
        docs.reverse();
      }
      const hasMore = docs.length > q.limit;
      const items = hasMore ? (q.afterSeq !== undefined ? docs.slice(0, q.limit) : docs.slice(1)) : docs;
      return { items: items.map(toMessage), headSeq: c.headSeq, hasMore };
    },

    /** Gap recovery after a reconnect: everything after `afterSeq`, bounded. */
    async sync(conversationId: string, userId: string, afterSeq: number, limit: number = LIMITS.PAGE_SIZE_DEFAULT): Promise<SyncPullResult> {
      const page = await this.history(conversationId, userId, { afterSeq, limit });
      return { messages: page.items, headSeq: page.headSeq, hasMore: page.hasMore };
    },

    async edit(userId: string, input: MessageEditValidated): Promise<Message> {
      const m = await loadMessage(input.messageId);
      if (m.senderId.toString() !== userId) throw forbidden('Only the sender can edit a message');
      if (m.deletedAt) throw new AppError(ErrorCode.MESSAGE_IMMUTABLE, 'Deleted messages cannot be edited');
      if (m.kind === 'system') throw new AppError(ErrorCode.MESSAGE_IMMUTABLE, 'System messages cannot be edited');
      if (m.kind === 'encrypted') {
        if (!input.encrypted) throw new AppError(ErrorCode.ENCRYPTION_REQUIRED);
        m.encrypted = input.encrypted;
      } else {
        if (input.text === undefined) throw new AppError(ErrorCode.PLAINTEXT_NOT_ALLOWED, 'Provide text for a plaintext message');
        m.text = input.text;
      }
      m.editedAt = new Date();
      await m.save();
      await ConversationModel.updateOne({ _id: m.conversationId, 'lastMessage.id': m._id }, { $set: { 'lastMessage.text': m.kind === 'encrypted' ? null : m.text } }, { timestamps: false });
      return broadcastUpdated(m);
    },

    async remove(userId: string, messageId: string): Promise<{ conversationId: string; messageId: string; seq: number }> {
      const m = await loadMessage(messageId);
      if (m.senderId.toString() !== userId) {
        const c = await conversations.loadForMember(m.conversationId.toString(), userId);
        const role = findParticipant(c, userId)?.role ?? 'member';
        if (ROLE_RANK[role] < ROLE_RANK.admin) throw forbidden('Only the sender or an admin can delete a message');
      }
      if (!m.deletedAt) {
        m.deletedAt = new Date();
        m.text = null;
        m.encrypted = null;
        m.attachments = [];
        await m.save();
        await ConversationModel.updateOne({ _id: m.conversationId, 'lastMessage.id': m._id }, { $set: { 'lastMessage.text': null } }, { timestamps: false });
      }
      const payload = { conversationId: m.conversationId.toString(), messageId: m._id.toString(), seq: m.seq };
      hub.toConversation(payload.conversationId, 'message:deleted', payload);
      return payload;
    },

    async toggleReaction(userId: string, messageId: string, emoji: string): Promise<Message> {
      const m = await loadMessage(messageId);
      await conversations.loadForMember(m.conversationId.toString(), userId);
      if (m.deletedAt) throw new AppError(ErrorCode.MESSAGE_IMMUTABLE, 'Cannot react to a deleted message');
      const uid = toObjectId(userId);
      const reaction = m.reactions.find((r) => r.emoji === emoji);
      if (reaction) {
        const had = reaction.userIds.some((u) => u.equals(uid));
        reaction.userIds = had ? reaction.userIds.filter((u) => !u.equals(uid)) : [...reaction.userIds, uid];
        if (reaction.userIds.length === 0) m.reactions = m.reactions.filter((r) => r.emoji !== emoji);
      } else {
        m.reactions.push({ emoji, userIds: [uid] });
      }
      m.markModified('reactions');
      await m.save();
      return broadcastUpdated(m);
    },

    /** Full-text search over plaintext messages in conversations the user belongs to. */
    async search(userId: string, q: { q: string; conversationId?: string; limit: number }): Promise<Message[]> {
      const convIds = q.conversationId ? [q.conversationId] : await conversations.listIdsForUser(userId);
      if (q.conversationId) await conversations.loadForMember(q.conversationId, userId);
      const docs = await MessageModel.find(
        { conversationId: { $in: convIds.map(toObjectId) }, deletedAt: null, $text: { $search: q.q } },
        { score: { $meta: 'textScore' } },
      )
        .sort({ score: { $meta: 'textScore' }, seq: -1 })
        .limit(q.limit);
      return docs.map(toMessage);
    },
  };
}

export type MessagesService = ReturnType<typeof createMessagesService>;
