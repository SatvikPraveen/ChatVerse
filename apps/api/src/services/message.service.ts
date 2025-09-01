// apps/api/src/services/message.service.ts
import { Message, MessageDocument } from '../models/Message.js';
import { Conversation } from '../models/Conversation.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';
import { redisHelpers } from '../db/redis.js';
import { AppMetrics } from '../telemetry/metrics.js';
import { CursorPagination } from '../utils/pagination.js';
import { ERROR_CODES, CACHE_TTL } from '../config/constants.js';
import { PushController } from '../controllers/push.controller.js';
import type { SendMessageRequest } from '@chatverse/types';

export class MessageService {
  async sendMessage(userId: string, conversationId: string, data: SendMessageRequest): Promise<MessageDocument> {
    try {
      // Verify user is participant in conversation
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.user': userId,
        isActive: true
      });

      if (!conversation) {
        throw new Error(ERROR_CODES.CONVERSATION_NOT_FOUND);
      }

      // Create message
      const message = new Message({
        conversationId,
        senderId: userId,
        content: data.content,
        type: data.type || 'text',
        attachments: data.attachments || [],
        replyTo: data.replyTo
      });

      await message.save();
      await message.populate('senderId', 'name email avatar');

      // Update conversation's last message and unread counts
      await this.updateConversationLastMessage(conversation, message);

      // Send push notifications to participants
      await this.sendPushNotifications(conversation, message, userId);

      // Clear message cache
      await this.clearConversationMessageCache(conversationId);

      AppMetrics.recordMessage('sent');
      logger.info({
        userId,
        conversationId,
        messageId: message._id,
        type: message.type,
        hasAttachments: message.attachments && message.attachments.length > 0
      }, 'Message sent');

      return message;
    } catch (error) {
      logger.error({ error, userId, conversationId, data }, 'Failed to send message');
      AppMetrics.recordError('message', 'send');
      throw error;
    }
  }

  async getMessages(
    conversationId: string,
    userId: string,
    options: { limit?: number; cursor?: string } = {}
  ): Promise<{
    messages: MessageDocument[];
    hasMore: boolean;
    nextCursor?: string;
  }> {
    try {
      // Verify user is participant
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.user': userId,
        isActive: true
      });

      if (!conversation) {
        throw new Error(ERROR_CODES.CONVERSATION_NOT_FOUND);
      }

      const cacheKey = `messages:${conversationId}:${options.cursor || 'initial'}:${options.limit || 50}`;

      // Try cache first
      const cached = await redisHelpers.getCache(cacheKey);
      if (cached) {
        AppMetrics.recordCacheOperation('hit');
        return cached;
      }

      const pagination = new CursorPagination('createdAt', 'desc');
      const query = {
        conversationId,
        isDeleted: false,
        ...pagination.buildQuery(options.cursor)
      };

      const messages = await Message.find(query)
        .populate('senderId', 'name email avatar')
        .populate('replyTo', 'content senderId createdAt')
        .populate('reactions.users', 'name avatar')
        .sort(pagination.buildSort())
        .limit(options.limit || 50)
        .lean();

      const result = pagination.createResult(messages, options.limit || 50);

      // Cache the result
      await redisHelpers.setCache(cacheKey, result, CACHE_TTL.MESSAGE_LIST);
      AppMetrics.recordCacheOperation('set');

      logger.debug({
        conversationId,
        userId,
        count: messages.length
      }, 'Retrieved messages');

      return {
        messages: result.data as MessageDocument[],
        hasMore: result.hasMore,
        nextCursor: result.nextCursor
      };
    } catch (error) {
      logger.error({ error, conversationId, userId }, 'Failed to get messages');
      AppMetrics.recordError('message', 'get');
      throw error;
    }
  }

  async getMessage(messageId: string, userId: string): Promise<MessageDocument | null> {
    try {
      const message = await Message.findOne({
        _id: messageId,
        isDeleted: false
      }).populate('senderId', 'name email avatar');

      if (!message) {
        return null;
      }

      // Verify user is participant in the conversation
      const conversation = await Conversation.findOne({
        _id: message.conversationId,
        'participants.user': userId
      });

      if (!conversation) {
        throw new Error(ERROR_CODES.FORBIDDEN);
      }

      return message;
    } catch (error) {
      logger.error({ error, messageId, userId }, 'Failed to get message');
      throw error;
    }
  }

  async updateMessage(messageId: string, userId: string, content: string): Promise<MessageDocument> {
    try {
      const message = await Message.findOne({
        _id: messageId,
        senderId: userId,
        isDeleted: false
      });

      if (!message) {
        throw new Error(ERROR_CODES.MESSAGE_NOT_FOUND);
      }

      // Edit the message
      message.edit(content);
      await message.save();

      // Clear caches
      await this.clearConversationMessageCache(message.conversationId.toString());
      await this.clearMessageCache(messageId);

      logger.info({ userId, messageId, conversationId: message.conversationId }, 'Message updated');

      return message;
    } catch (error) {
      logger.error({ error, messageId, userId, content }, 'Failed to update message');
      AppMetrics.recordError('message', 'update');
      throw error;
    }
  }

  async deleteMessage(messageId: string, userId: string): Promise<void> {
    try {
      const message = await Message.findOne({
        _id: messageId,
        senderId: userId,
        isDeleted: false
      });

      if (!message) {
        throw new Error(ERROR_CODES.MESSAGE_NOT_FOUND);
      }

      // Soft delete the message
      message.softDelete();
      await message.save();

      // Clear caches
      await this.clearConversationMessageCache(message.conversationId.toString());
      await this.clearMessageCache(messageId);

      logger.info({ userId, messageId, conversationId: message.conversationId }, 'Message deleted');
    } catch (error) {
      logger.error({ error, messageId, userId }, 'Failed to delete message');
      AppMetrics.recordError('message', 'delete');
      throw error;
    }
  }

  async addReaction(messageId: string, userId: string, emoji: string): Promise<MessageDocument> {
    try {
      const message = await Message.findOne({
        _id: messageId,
        isDeleted: false
      });

      if (!message) {
        throw new Error(ERROR_CODES.MESSAGE_NOT_FOUND);
      }

      // Verify user is participant
      const conversation = await Conversation.findOne({
        _id: message.conversationId,
        'participants.user': userId
      });

      if (!conversation) {
        throw new Error(ERROR_CODES.FORBIDDEN);
      }

      // Add reaction
      message.addReaction(emoji, userId);
      await message.save();

      // Clear caches
      await this.clearMessageCache(messageId);

      logger.info({ userId, messageId, emoji }, 'Reaction added');

      return message;
    } catch (error) {
      logger.error({ error, messageId, userId, emoji }, 'Failed to add reaction');
      throw error;
    }
  }

  async removeReaction(messageId: string, userId: string, emoji: string): Promise<MessageDocument> {
    try {
      const message = await Message.findOne({
        _id: messageId,
        isDeleted: false
      });

      if (!message) {
        throw new Error(ERROR_CODES.MESSAGE_NOT_FOUND);
      }

      // Remove reaction
      message.removeReaction(emoji, userId);
      await message.save();

      // Clear caches
      await this.clearMessageCache(messageId);

      logger.info({ userId, messageId, emoji }, 'Reaction removed');

      return message;
    } catch (error) {
      logger.error({ error, messageId, userId, emoji }, 'Failed to remove reaction');
      throw error;
    }
  }

  async markMessagesAsRead(conversationId: string, userId: string, messageIds: string[]): Promise<void> {
    try {
      // Verify user is participant
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.user': userId
      });

      if (!conversation) {
        throw new Error(ERROR_CODES.CONVERSATION_NOT_FOUND);
      }

      // Mark messages as read
      await Message.updateMany(
        {
          _id: { $in: messageIds },
          conversationId,
          'readBy.user': { $ne: userId }
        },
        {
          $push: {
            readBy: {
              user: userId,
              readAt: new Date()
            }
          }
        }
      );

      // Update conversation unread count
      conversation.resetUnreadCount(userId);
      await conversation.save();

      // Clear caches
      await this.clearConversationMessageCache(conversationId);

      logger.debug({
        userId,
        conversationId,
        messageCount: messageIds.length
      }, 'Messages marked as read');
    } catch (error) {
      logger.error({ error, conversationId, userId, messageIds }, 'Failed to mark messages as read');
      throw error;
    }
  }

  async searchMessages(
    userId: string,
    query: string,
    options: {
      conversationId?: string;
      limit?: number;
      offset?: number
    } = {}
  ): Promise<{ messages: MessageDocument[]; total: number }> {
    try {
      const searchQuery: any = {
        isDeleted: false,
        $text: { $search: query }
      };

      // If searching within specific conversation, verify access
      if (options.conversationId) {
        const conversation = await Conversation.findOne({
          _id: options.conversationId,
          'participants.user': userId
        });

        if (!conversation) {
          throw new Error(ERROR_CODES.FORBIDDEN);
        }

        searchQuery.conversationId = options.conversationId;
      } else {
        // Search across all user's conversations
        const userConversations = await Conversation.find({
          'participants.user': userId,
          isActive: true
        }).select('_id');

        searchQuery.conversationId = {
          $in: userConversations.map(c => c._id)
        };
      }

      const [messages, total] = await Promise.all([
        Message.find(searchQuery)
          .populate('senderId', 'name email avatar')
          .populate('conversationId', 'name type')
          .sort({ createdAt: -1 })
          .skip(options.offset || 0)
          .limit(options.limit || 20),
        Message.countDocuments(searchQuery)
      ]);

      logger.info({
        userId,
        query,
        conversationId: options.conversationId,
        resultCount: messages.length,
        total
      }, 'Messages searched');

      return { messages, total };
    } catch (error) {
      logger.error({ error, userId, query, options }, 'Failed to search messages');
      throw error;
    }
  }

  async getMessageStats(conversationId: string, userId: string): Promise<{
    totalMessages: number;
    messagesByUser: Record<string, number>;
    messagesByType: Record<string, number>;
  }> {
    try {
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.user': userId
      });

      if (!conversation) {
        throw new Error(ERROR_CODES.CONVERSATION_NOT_FOUND);
      }

      const [totalMessages, messagesByUser, messagesByType] = await Promise.all([
        Message.countDocuments({ conversationId, isDeleted: false }),
        Message.aggregate([
          { $match: { conversationId: conversation._id, isDeleted: false } },
          { $group: { _id: '$senderId', count: { $sum: 1 } } },
          { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
          { $project: { userId: '$_id', count: 1, name: { $arrayElemAt: ['$user.name', 0] } } }
        ]),
        Message.aggregate([
          { $match: { conversationId: conversation._id, isDeleted: false } },
          { $group: { _id: '$type', count: { $sum: 1 } } }
        ])
      ]);

      const userStats: Record<string, number> = {};
      messagesByUser.forEach((item: any) => {
        userStats[item.name || item.userId] = item.count;
      });

      const typeStats: Record<string, number> = {};
      messagesByType.forEach((item: any) => {
        typeStats[item._id] = item.count;
      });

      return {
        totalMessages,
        messagesByUser: userStats,
        messagesByType: typeStats
      };
    } catch (error) {
      logger.error({ error, conversationId, userId }, 'Failed to get message stats');
      throw error;
    }
  }

  private async updateConversationLastMessage(conversation: any, message: MessageDocument): Promise<void> {
    conversation.lastMessage = {
      content: message.content,
      sender: message.senderId,
      timestamp: message.createdAt,
      type: message.type
    };

    // Increment unread count for other participants
    for (const participant of conversation.participants) {
      const participantId = participant.user.toString();
      if (participantId !== message.senderId.toString()) {
        conversation.incrementUnreadCount(participantId);
      }
    }

    await conversation.save();
  }

  private async sendPushNotifications(conversation: any, message: MessageDocument, senderId: string): Promise<void> {
    try {
      const sender = await User.findById(senderId).select('name');
      if (!sender) return;

      const otherParticipants = conversation.participants.filter(
        (p: any) => p.user.toString() !== senderId
      );

      for (const participant of otherParticipants) {
        const participantId = participant.user.toString();

        // Check if user has notifications enabled
        const user = await User.findById(participantId).select('settings.notifications');
        if (user?.settings.notifications.push) {
          await PushController.sendNotificationToUser(participantId, {
            title: `${sender.name}`,
            body: message.content.length > 100
              ? `${message.content.substring(0, 100)}...`
              : message.content,
            data: {
              conversationId: conversation._id.toString(),
              messageId: message._id.toString(),
              type: 'message'
            }
          });
        }
      }
    } catch (error) {
      logger.error({ error, conversationId: conversation._id }, 'Failed to send push notifications');
    }
  }

  private async clearMessageCache(messageId: string): Promise<void> {
    await redisHelpers.deleteCache(`message:${messageId}`);
  }

  private async clearConversationMessageCache(conversationId: string): Promise<void> {
    const pattern = `messages:${conversationId}:*`;
    await redisHelpers.invalidatePattern(pattern);
  }
}
