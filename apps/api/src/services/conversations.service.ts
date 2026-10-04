import {
  ErrorCode,
  type Conversation,
  type CreateConversationInput,
  type Page,
  type ParticipantRole,
  type UpdateConversationInput,
} from '@chatverse/protocol';
import type { Deps } from '../deps.js';
import {
  ConversationModel,
  User,
  findParticipant,
  participantIds,
  toConversation,
  type ConversationDoc,
  type ConversationDocument,
} from '../domain/models/index.js';
import { decodeCursor, encodeCursor } from '../lib/cursor.js';
import { AppError, forbidden, isDuplicateKeyError, notFound } from '../lib/errors.js';
import { directKey, toObjectId } from '../lib/ids.js';

const ROLE_RANK: Record<ParticipantRole, number> = { member: 0, admin: 1, owner: 2 };

export interface ConversationHooks {
  /** Invoked after membership changes so dependent caches (presence contacts) can be invalidated. */
  membershipChanged?: (userIds: string[]) => Promise<void>;
}

export function createConversationsService(
  deps: Pick<Deps, 'hub' | 'logger'>,
  hooks: ConversationHooks = {},
) {
  const { hub } = deps;
  const membershipChanged = (ids: string[]) =>
    hooks
      .membershipChanged?.(ids)
      .catch((err) => deps.logger.warn({ err }, 'membershipChanged hook failed'));

  async function load(conversationId: string): Promise<ConversationDocument> {
    const c = await ConversationModel.findById(toObjectId(conversationId));
    if (!c) throw notFound('Conversation');
    return c;
  }

  /** Load and verify membership in one go; the check almost every operation needs. */
  async function loadForMember(
    conversationId: string,
    userId: string,
  ): Promise<ConversationDocument> {
    const c = await load(conversationId);
    if (!findParticipant(c, userId)) throw new AppError(ErrorCode.NOT_A_PARTICIPANT);
    return c;
  }

  function requireRole(c: ConversationDoc, userId: string, min: ParticipantRole): void {
    const p = findParticipant(c, userId);
    if (!p) throw new AppError(ErrorCode.NOT_A_PARTICIPANT);
    if (ROLE_RANK[p.role] < ROLE_RANK[min]) throw forbidden(`Requires ${min} role`);
  }

  async function assertUsersExist(ids: string[]): Promise<void> {
    const count = await User.countDocuments({ _id: { $in: ids.map(toObjectId) }, deletedAt: null });
    if (count !== new Set(ids).size)
      throw new AppError(ErrorCode.NOT_FOUND, 'One or more users do not exist');
  }

  function broadcast(
    c: ConversationDoc,
    event: 'conversation:added' | 'conversation:updated',
    extra: string[] = [],
  ): void {
    hub.toUsers(participantIds(c), event, { conversation: toConversation(c) });
    void membershipChanged([...participantIds(c), ...extra]);
  }

  return {
    load,
    loadForMember,

    async create(creatorId: string, input: CreateConversationInput): Promise<Conversation> {
      const others = [...new Set(input.participantIds)].filter((id) => id !== creatorId);
      if (input.kind === 'direct') {
        const peerId = others[0];
        if (!peerId)
          throw new AppError(
            ErrorCode.VALIDATION_ERROR,
            'A direct conversation needs another participant',
          );
        await assertUsersExist([peerId]);
        const key = directKey(creatorId, peerId);
        // Idempotent: the unique sparse index on directKey makes a concurrent double-create safe.
        const existing = await ConversationModel.findOne({ directKey: key });
        if (existing) return toConversation(existing);
        try {
          const c = await ConversationModel.create({
            kind: 'direct',
            createdBy: toObjectId(creatorId),
            encrypted: input.encrypted,
            directKey: key,
            participants: [creatorId, peerId].map((id) => ({
              userId: toObjectId(id),
              role: 'member',
            })),
          });
          for (const id of participantIds(c)) hub.joinUserToConversation(id, c._id.toString());
          broadcast(c, 'conversation:added');
          return toConversation(c);
        } catch (err) {
          if (isDuplicateKeyError(err)) {
            const raced = await ConversationModel.findOne({ directKey: key });
            if (raced) return toConversation(raced);
          }
          throw err;
        }
      }

      await assertUsersExist(others);
      const c = await ConversationModel.create({
        kind: 'group',
        name: input.name,
        topic: input.topic ?? null,
        createdBy: toObjectId(creatorId),
        encrypted: input.encrypted,
        participants: [
          { userId: toObjectId(creatorId), role: 'owner' },
          ...others.map((id) => ({ userId: toObjectId(id), role: 'member' as const })),
        ],
      });
      for (const id of participantIds(c)) hub.joinUserToConversation(id, c._id.toString());
      broadcast(c, 'conversation:added');
      return toConversation(c);
    },

    async get(conversationId: string, userId: string): Promise<Conversation> {
      return toConversation(await loadForMember(conversationId, userId));
    },

    /** Conversations of a user, most recently active first, cursor-paginated on (updatedAt, _id). */
    async list(userId: string, limit: number, cursorRaw?: string): Promise<Page<Conversation>> {
      const cursor = decodeCursor(cursorRaw);
      const filter: Record<string, unknown> = { 'participants.userId': toObjectId(userId) };
      if (cursor) {
        const t = new Date(cursor.t);
        filter.$or = [
          { updatedAt: { $lt: t } },
          { updatedAt: t, _id: { $lt: toObjectId(cursor.id) } },
        ];
      }
      const docs = await ConversationModel.find(filter)
        .sort({ updatedAt: -1, _id: -1 })
        .limit(limit + 1);
      const hasMore = docs.length > limit;
      const page = hasMore ? docs.slice(0, limit) : docs;
      const last = page[page.length - 1];
      return {
        items: page.map(toConversation),
        nextCursor:
          hasMore && last
            ? encodeCursor({ t: last.updatedAt.toISOString(), id: last._id.toString() })
            : null,
      };
    },

    async listIdsForUser(userId: string): Promise<string[]> {
      const docs = await ConversationModel.find({
        'participants.userId': toObjectId(userId),
      }).select('_id');
      return docs.map((d) => d._id.toString());
    },

    async update(
      conversationId: string,
      userId: string,
      input: UpdateConversationInput,
    ): Promise<Conversation> {
      const c = await loadForMember(conversationId, userId);
      if (c.kind === 'direct') throw forbidden('Direct conversations cannot be edited');
      requireRole(c, userId, 'admin');
      if (input.name !== undefined) c.name = input.name;
      if (input.topic !== undefined) c.topic = input.topic;
      if (input.avatarUrl !== undefined) c.avatarUrl = input.avatarUrl;
      await c.save();
      broadcast(c, 'conversation:updated');
      return toConversation(c);
    },

    async addParticipants(
      conversationId: string,
      actorId: string,
      userIds: string[],
    ): Promise<Conversation> {
      const c = await loadForMember(conversationId, actorId);
      if (c.kind === 'direct') throw forbidden('Cannot add participants to a direct conversation');
      requireRole(c, actorId, 'admin');
      const fresh = [...new Set(userIds)].filter((id) => !findParticipant(c, id));
      if (fresh.length === 0) return toConversation(c);
      await assertUsersExist(fresh);
      for (const id of fresh) {
        c.participants.push({
          userId: toObjectId(id),
          role: 'member',
          joinedAt: new Date(),
          lastReadSeq: c.headSeq,
          lastDeliveredSeq: c.headSeq,
          muted: false,
        });
      }
      await c.save();
      for (const id of fresh) hub.joinUserToConversation(id, conversationId);
      broadcast(c, 'conversation:updated');
      return toConversation(c);
    },

    async removeParticipant(
      conversationId: string,
      actorId: string,
      targetId: string,
    ): Promise<Conversation> {
      const c = await loadForMember(conversationId, actorId);
      if (c.kind === 'direct')
        throw forbidden('Cannot remove participants from a direct conversation');
      const target = findParticipant(c, targetId);
      if (!target) throw notFound('Participant');
      const actor = findParticipant(c, actorId)!;
      if (actorId !== targetId) {
        requireRole(c, actorId, 'admin');
        if (ROLE_RANK[target.role] >= ROLE_RANK[actor.role])
          throw forbidden('Cannot remove a participant with an equal or higher role');
      }
      c.participants = c.participants.filter((p) => p.userId.toString() !== targetId);
      await c.save();
      hub.leaveUserFromConversation(targetId, conversationId);
      hub.toUser(targetId, 'conversation:removed', { conversationId });
      broadcast(c, 'conversation:updated', [targetId]);
      return toConversation(c);
    },

    async leave(conversationId: string, userId: string): Promise<void> {
      const c = await loadForMember(conversationId, userId);
      if (c.kind === 'direct') throw forbidden('Cannot leave a direct conversation');
      const me = findParticipant(c, userId)!;
      c.participants = c.participants.filter((p) => p.userId.toString() !== userId);
      // Hand ownership to the longest-standing remaining member so the group never becomes orphaned.
      if (
        me.role === 'owner' &&
        c.participants.length > 0 &&
        !c.participants.some((p) => p.role === 'owner')
      ) {
        const successor = [...c.participants].sort(
          (a, b) => a.joinedAt.getTime() - b.joinedAt.getTime(),
        )[0]!;
        successor.role = 'owner';
      }
      await c.save();
      hub.leaveUserFromConversation(userId, conversationId);
      hub.toUser(userId, 'conversation:removed', { conversationId });
      broadcast(c, 'conversation:updated', [userId]);
    },
  };
}

export type ConversationsService = ReturnType<typeof createConversationsService>;
