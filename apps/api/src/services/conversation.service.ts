// apps/api/src/services/conversation.service.ts
import { Conversation, ConversationDocument } from '../models/Conversation.js';
import { User } from '../models/User.js';
import { Message } from '../models/Message.js';
import { logger } from '../utils/logger.js';
import { redisHelpers } from '../db/redis.js';
import { AppMetrics } from '../telemetry/metrics.js';
import { CursorPagination } from '../utils/pagination.js';
import { ERROR_CODES, CACHE_TTL } from '../config/constants.js';
import type { CreateConversationRequest, UpdateConversationRequest } from '@chatverse/types';

export class ConversationService {
  async createConversation(userId: string, data: CreateConversationRequest): Promise<ConversationDocument> {
    try {
      const { type, name, description, participants } = data;

      // Validate participants exist
      const participantUsers = await User.find({
        _id: { $in: participants },
        isActive: true
      });

      if (participantUsers.length !== participants.length) {
        throw new Error(ERROR_CODES.USER_NOT_FOUND);
      }

      // For direct conversations, check if one already exists
      if (type === 'direct') {
        if (participants.length !== 1) {
          throw new Error('Direct conversations require exactly one other participant');
        }

        const existingConversation = await this.findDirectConversation(userId, participants[0]);
        if (existingConversation) {
          return existingConversation;
        }
      }

      // Create conversation
      const conversation = new Conversation({
        type,
        name: type === 'group' ? name : undefined,
        description: type === 'group' ? description : undefined,
        participants: [
          { user: userId, role: type === 'group' ? 'owner' : 'member' },
          ...participants.map(pid => ({ user: pid, role: 'member' }))
        ]
      });

      await conversation.save();
      await conversation.populate('participants.user', 'name email avatar presence');

      // Clear user's conversation cache
      await this.clearUserConversationCache(userId);
      for (const participantId of participants) {
        await this.clearUserConversationCache(participantId);
      }

      AppMetrics.recordMessage('sent');
      logger.info({
        userId,
        conversationId: conversation._id,
        type,
        participantCount: participants.length
      }, 'Conversation created');

      return conversation;
    } catch (error) {
      logger.error({ error, userId, data }, 'Failed to create conversation');
      AppMetrics.recordError('conversation', 'create');
      throw error;
    }
  }

  async getUserConversations(userId: string, options: { limit?: number; cursor?: string } = {}): Promise<{
    conversations: ConversationDocument[];
    hasMore: boolean;
    nextCursor?: string;
  }> {
    try {
      const cacheKey = `user_conversations:${userId}:${options.cursor || 'initial'}:${options.limit || 20}`;

      // Try to get from cache first
      const cached = await redisHelpers.getCache(cacheKey);
      if (cached) {
        AppMetrics.recordCacheOperation('hit');
        return cached;
      }

      const pagination = new CursorPagination('updatedAt', 'desc');
      const query = {
        'participants.user': userId,
        isActive: true,
        ...pagination.buildQuery(options.cursor)
      };

      const conversations = await Conversation.find(query)
        .populate('participants.user', 'name email avatar presence')
        .populate('lastMessage.sender', 'name avatar')
        .sort(pagination.buildSort())
        .limit(options.limit || 20)
        .lean();

      const result = pagination.createResult(conversations, options.limit || 20);

      // Cache the result
      await redisHelpers.setCache(cacheKey, result, CACHE_TTL.CONVERSATION_LIST);
      AppMetrics.recordCacheOperation('set');

      logger.debug({ userId, count: conversations.length }, 'Retrieved user conversations');

      return {
        conversations: result.data as ConversationDocument[],
        hasMore: result.hasMore,
        nextCursor: result.nextCursor
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user conversations');
      AppMetrics.recordError('conversation', 'get_user_conversations');
      throw error;
    }
  }

  async getConversationById(conversationId: string, userId: string): Promise<ConversationDocument | null> {
    try {
      const cacheKey = `conversation:${conversationId}`;

      // Try cache first
      const cached = await redisHelpers.getCache(cacheKey);
      if (cached) {
        AppMetrics.recordCacheOperation('hit');

        // Verify user is still a participant
        const conversation = cached as ConversationDocument;
        if (!conversation.hasParticipant?.(userId)) {
          throw new Error(ERROR_CODES.FORBIDDEN);
        }

        return conversation;
      }

      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.user': userId,
        isActive: true
      }).populate('participants.user', 'name email avatar presence');

      if (conversation) {
        // Cache the conversation
        await redisHelpers.setCache(cacheKey, conversation, CACHE_TTL.CONVERSATION_LIST);
        AppMetrics.recordCacheOperation('set');
      } else {
        AppMetrics.recordCacheOperation('miss');
      }

      return conversation;
    } catch (error) {
      logger.error({ error, conversationId, userId }, 'Failed to get conversation');
      AppMetrics.recordError('conversation', 'get_by_id');
      throw error;
    }
  }

  async updateConversation(
    conversationId: string,
    userId: string,
    updates: UpdateConversationRequest
  ): Promise<ConversationDocument> {
    try {
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.user': userId,
        isActive: true
      });

      if (!conversation) {
        throw new Error(ERROR_CODES.CONVERSATION_NOT_FOUND);
      }

      // Check permissions (only owners/admins can update group conversations)
      if (conversation.type === 'group') {
        const participant = conversation.getParticipant(userId);
        if (participant?.role === 'member') {
          throw new Error(ERROR_CODES.FORBIDDEN);
        }
      }

      // Apply updates
      Object.assign(conversation, updates);
      await conversation.save();

      // Clear caches
      await this.clearConversationCache(conversationId);
      for (const participant of conversation.participants) {
        await this.clearUserConversationCache(participant.user.toString());
      }

      logger.info({ userId, conversationId, updates }, 'Conversation updated');

      return conversation;
    } catch (error) {
      logger.error({ error, conversationId, userId, updates }, 'Failed to update conversation');
      AppMetrics.recordError('conversation', 'update');
      throw error;
    }
  }

  async addParticipant(conversationId: string, userId: string, newUserId: string, role: string = 'member'): Promise<void> {
    try {
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.user': userId,
        isActive: true
      });

      if (!conversation) {
        throw new Error(ERROR_CODES.CONVERSATION_NOT_FOUND);
      }

      // Check permissions
      const participant = conversation.getParticipant(userId);
      if (participant?.role === 'member') {
        throw new Error(ERROR_CODES.FORBIDDEN);
      }

      // Validate new user exists
      const newUser = await User.findOne({ _id: newUserId, isActive: true });
      if (!newUser) {
        throw new Error(ERROR_CODES.USER_NOT_FOUND);
      }

      // Add participant
      conversation.addParticipant(newUserId, role);
      await conversation.save();

      // Clear caches
      await this.clearConversationCache(conversationId);
      await this.clearUserConversationCache(newUserId);

      logger.info({ userId, conversationId, newUserId, role }, 'Participant added to conversation');
    } catch (error) {
      logger.error({ error, conversationId, userId, newUserId }, 'Failed to add participant');
      AppMetrics.recordError('conversation', 'add_participant');
      throw error;
    }
  }

  async removeParticipant(conversationId: string, userId: string, participantId: string): Promise<void> {
    try {
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.user': userId,
        isActive: true
      });

      if (!conversation) {
        throw new Error(ERROR_CODES.CONVERSATION_NOT_FOUND);
      }

      // Check permissions (can remove self, or admins/owners can remove others)
      const participant = conversation.getParticipant(userId);
      if (participantId !== userId && participant?.role === 'member') {
        throw new Error(ERROR_CODES.FORBIDDEN);
      }

      // Remove participant
      conversation.removeParticipant(participantId);
      await conversation.save();

      // Clear caches
      await this.clearConversationCache(conversationId);
      await this.clearUserConversationCache(participantId);

      logger.info({ userId, conversationId, participantId }, 'Participant removed from conversation');
    } catch (error) {
      logger.error({ error, conversationId, userId, participantId }, 'Failed to remove participant');
      AppMetrics.recordError('conversation', 'remove_participant');
      throw error;
    }
  }

  async deleteConversation(conversationId: string, userId: string): Promise<void> {
    try {
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.user': userId,
        isActive: true
      });

      if (!conversation) {
        throw new Error(ERROR_CODES.CONVERSATION_NOT_FOUND);
      }

      // Only owners can delete group conversations
      if (conversation.type === 'group') {
        const participant = conversation.getParticipant(userId);
        if (participant?.role !== 'owner') {
          throw new Error(ERROR_CODES.FORBIDDEN);
        }
      }

      // Soft delete
      conversation.isActive = false;
      await conversation.save();

      // Clear caches for all participants
      for (const participant of conversation.participants) {
        await this.clearUserConversationCache(participant.user.toString());
      }
      await this.clearConversationCache(conversationId);

      logger.info({ userId, conversationId }, 'Conversation deleted');
    } catch (error) {
      logger.error({ error, conversationId, userId }, 'Failed to delete conversation');
      AppMetrics.recordError('conversation', 'delete');
      throw error;
    }
  }

  async markAsRead(conversationId: string, userId: string, lastMessageId?: string): Promise<void> {
    try {
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.user': userId,
        isActive: true
      });

      if (!conversation) {
        throw new Error(ERROR_CODES.CONVERSATION_NOT_FOUND);
      }

      // Update participant's read status
      const participant = conversation.getParticipant(userId);
      if (participant) {
        participant.lastReadAt = new Date();
        if (lastMessageId) {
          participant.lastReadMessageId = lastMessageId as any;
        }
      }

      // Reset unread count for user
      conversation.resetUnreadCount(userId);
      await conversation.save();

      // Clear conversation cache
      await this.clearConversationCache(conversationId);

      logger.debug({ userId, conversationId, lastMessageId }, 'Conversation marked as read');
    } catch (error) {
      logger.error({ error, conversationId, userId }, 'Failed to mark conversation as read');
      throw error;
    }
  }

  async getConversationStats(conversationId: string, userId: string): Promise<{
    messageCount: number;
    participantCount: number;
    createdAt: Date;
    lastActivity: Date;
  }> {
    try {
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.user': userId,
        isActive: true
      });

      if (!conversation) {
        throw new Error(ERROR_CODES.CONVERSATION_NOT_FOUND);
      }

      const messageCount = await Message.countDocuments({
        conversationId,
        isDeleted: false
      });

      return {
        messageCount,
        participantCount: conversation.participants.length,
        createdAt: conversation.createdAt,
        lastActivity: conversation.updatedAt
      };
    } catch (error) {
      logger.error({ error, conversationId, userId }, 'Failed to get conversation stats');
      throw error;
    }
  }

  private async findDirectConversation(userId1: string, userId2: string): Promise<ConversationDocument | null> {
    return await Conversation.findOne({
      type: 'direct',
      $and: [
        { 'participants.user': userId1 },
        { 'participants.user': userId2 }
      ],
      isActive: true
    }).populate('participants.user', 'name email avatar presence');
  }

  private async clearConversationCache(conversationId: string): Promise<void> {
    await redisHelpers.deleteCache(`conversation:${conversationId}`);
  }

  private async clearUserConversationCache(userId: string): Promise<void> {
    const pattern = `user_conversations:${userId}:*`;
    await redisHelpers.invalidatePattern(pattern);
  }
}
