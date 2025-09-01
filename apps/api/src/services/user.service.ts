// apps/api/src/services/user.service.ts
import { User, UserDocument } from '../models/User.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { logger } from '../utils/logger.js';
import { redisHelpers } from '../db/redis.js';
import { AppMetrics } from '../telemetry/metrics.js';
import { ERROR_CODES, CACHE_TTL } from '../config/constants.js';
import type { UpdateProfileRequest, UpdateSettingsRequest } from '@chatverse/types';

export class UserService {
  async getUserById(userId: string): Promise<UserDocument | null> {
    try {
      const cacheKey = `user:${userId}`;

      // Try cache first
      const cached = await redisHelpers.getCache(cacheKey);
      if (cached) {
        AppMetrics.recordCacheOperation('hit');
        return cached as UserDocument;
      }

      const user = await User.findOne({
        _id: userId,
        isActive: true
      });

      if (user) {
        // Cache user data
        await redisHelpers.setCache(cacheKey, user.toPublicJSON(), CACHE_TTL.USER_SESSION);
        AppMetrics.recordCacheOperation('set');
      } else {
        AppMetrics.recordCacheOperation('miss');
      }

      return user;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user by ID');
      throw error;
    }
  }

  async updateProfile(userId: string, updates: UpdateProfileRequest): Promise<UserDocument> {
    try {
      // Check if email is being updated and if it's already taken
      if (updates.email) {
        const existingUser = await User.findOne({
          email: updates.email.toLowerCase().trim(),
          _id: { $ne: userId },
          isActive: true
        });

        if (existingUser) {
          throw new Error(ERROR_CODES.USER_EXISTS);
        }
      }

      // Update user
      const user = await User.findByIdAndUpdate(
        userId,
        {
          ...(updates.name && { name: updates.name.trim() }),
          ...(updates.email && { email: updates.email.toLowerCase().trim() }),
          ...(updates.avatar !== undefined && { avatar: updates.avatar })
        },
        { new: true, runValidators: true }
      );

      if (!user) {
        throw new Error(ERROR_CODES.USER_NOT_FOUND);
      }

      // Clear user cache
      await this.clearUserCache(userId);

      logger.info({ userId, updates: Object.keys(updates) }, 'User profile updated');

      return user;
    } catch (error) {
      logger.error({ error, userId, updates }, 'Failed to update user profile');
      AppMetrics.recordError('user', 'update_profile');
      throw error;
    }
  }

  async updateSettings(userId: string, settings: UpdateSettingsRequest): Promise<UserDocument> {
    try {
      const updateData: any = {};

      // Build update object for nested settings
      if (settings.notifications) {
        if (settings.notifications.push !== undefined) {
          updateData['settings.notifications.push'] = settings.notifications.push;
        }
        if (settings.notifications.email !== undefined) {
          updateData['settings.notifications.email'] = settings.notifications.email;
        }
        if (settings.notifications.sound !== undefined) {
          updateData['settings.notifications.sound'] = settings.notifications.sound;
        }
      }

      if (settings.privacy) {
        if (settings.privacy.showOnlineStatus !== undefined) {
          updateData['settings.privacy.showOnlineStatus'] = settings.privacy.showOnlineStatus;
        }
        if (settings.privacy.allowMessageRequests !== undefined) {
          updateData['settings.privacy.allowMessageRequests'] = settings.privacy.allowMessageRequests;
        }
      }

      if (settings.theme) {
        updateData['settings.theme'] = settings.theme;
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: updateData },
        { new: true, runValidators: true }
      );

      if (!user) {
        throw new Error(ERROR_CODES.USER_NOT_FOUND);
      }

      // Clear user cache
      await this.clearUserCache(userId);

      logger.info({ userId, settingsUpdated: Object.keys(settings) }, 'User settings updated');

      return user;
    } catch (error) {
      logger.error({ error, userId, settings }, 'Failed to update user settings');
      AppMetrics.recordError('user', 'update_settings');
      throw error;
    }
  }

  async searchUsers(query: string, currentUserId: string, limit: number = 20): Promise<UserDocument[]> {
    try {
      if (query.length < 2) {
        throw new Error('Search query must be at least 2 characters');
      }

      const searchRegex = new RegExp(query, 'i');

      const users = await User.find({
        $and: [
          { _id: { $ne: currentUserId } },
          { isActive: true },
          {
            $or: [
              { name: { $regex: searchRegex } },
              { email: { $regex: searchRegex } }
            ]
          }
        ]
      })
      .select('name email avatar presence')
      .limit(limit)
      .lean();

      logger.debug({
        query,
        currentUserId,
        resultCount: users.length
      }, 'Users searched');

      return users as UserDocument[];
    } catch (error) {
      logger.error({ error, query, currentUserId }, 'Failed to search users');
      throw error;
    }
  }

  async updatePresence(userId: string, status: 'online' | 'away' | 'busy' | 'offline'): Promise<void> {
    try {
      await User.findByIdAndUpdate(userId, {
        'presence.status': status,
        'presence.lastSeen': new Date()
      });

      // Update presence in Redis
      await redisHelpers.setUserPresence(userId, status);

      // Clear user cache
      await this.clearUserCache(userId);

      logger.debug({ userId, status }, 'User presence updated');
    } catch (error) {
      logger.error({ error, userId, status }, 'Failed to update user presence');
      throw error;
    }
  }

  async getUserPresence(userId: string): Promise<{ status: string; lastSeen: Date } | null> {
    try {
      // Try Redis first
      const redisPresence = await redisHelpers.getUserPresence(userId);
      if (redisPresence) {
        return {
          status: redisPresence.status,
          lastSeen: new Date(redisPresence.lastSeen)
        };
      }

      // Fallback to database
      const user = await User.findById(userId).select('presence');
      return user ? user.presence : null;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user presence');
      return null;
    }
  }

  async getUserStats(userId: string): Promise<{
    conversationsCount: number;
    messagesSent: number;
    messagesReceived: number;
    memberSince: Date;
    lastActivity: Date;
  }> {
    try {
      const [user, conversationsCount, messagesSent, messagesReceived] = await Promise.all([
        User.findById(userId).select('createdAt presence.lastSeen'),
        Conversation.countDocuments({ 'participants.user': userId, isActive: true }),
        Message.countDocuments({ senderId: userId, isDeleted: false }),
        Message.countDocuments({
          conversationId: { $in: await this.getUserConversationIds(userId) },
          senderId: { $ne: userId },
          isDeleted: false
        })
      ]);

      if (!user) {
        throw new Error(ERROR_CODES.USER_NOT_FOUND);
      }

      return {
        conversationsCount,
        messagesSent,
        messagesReceived,
        memberSince: user.createdAt,
        lastActivity: user.presence.lastSeen
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user stats');
      throw error;
    }
  }

  async deleteUser(userId: string): Promise<void> {
    try {
      // Soft delete user
      const user = await User.findByIdAndUpdate(
        userId,
        {
          isActive: false,
          'presence.status': 'offline',
          email: `deleted_${userId}@deleted.com`,
          name: 'Deleted User',
          avatar: null
        },
        { new: true }
      );

      if (!user) {
        throw new Error(ERROR_CODES.USER_NOT_FOUND);
      }

      // Remove from all conversations (or mark as inactive)
      await Conversation.updateMany(
        { 'participants.user': userId },
        { $pull: { participants: { user: userId } } }
      );

      // Clear all user caches
      await this.clearAllUserCaches(userId);

      // Remove from Redis presence
      await redisHelpers.setUserPresence(userId, 'offline');

      logger.info({ userId }, 'User account deleted');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to delete user');
      AppMetrics.recordError('user', 'delete');
      throw error;
    }
  }

  async blockUser(userId: string, blockedUserId: string): Promise<void> {
    try {
      // In a real implementation, you'd have a separate BlockedUsers collection
      // For now, we'll add it to user settings
      await User.findByIdAndUpdate(userId, {
        $addToSet: { 'settings.blockedUsers': blockedUserId }
      });

      logger.info({ userId, blockedUserId }, 'User blocked');
    } catch (error) {
      logger.error({ error, userId, blockedUserId }, 'Failed to block user');
      throw error;
    }
  }

  async unblockUser(userId: string, unblockedUserId: string): Promise<void> {
    try {
      await User.findByIdAndUpdate(userId, {
        $pull: { 'settings.blockedUsers': unblockedUserId }
      });

      logger.info({ userId, unblockedUserId }, 'User unblocked');
    } catch (error) {
      logger.error({ error, userId, unblockedUserId }, 'Failed to unblock user');
      throw error;
    }
  }

  async getBlockedUsers(userId: string): Promise<string[]> {
    try {
      const user = await User.findById(userId).select('settings.blockedUsers');
      return user?.settings?.blockedUsers || [];
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get blocked users');
      return [];
    }
  }

  async reportUser(reporterId: string, reportedUserId: string, reason: string, details?: string): Promise<void> {
    try {
      // In a real implementation, you'd save this to a UserReports collection
      // For now, just log it
      logger.warn({
        reporterId,
        reportedUserId,
        reason,
        details,
        timestamp: new Date()
      }, 'User reported');

      // You might also want to automatically flag users with multiple reports
      // or integrate with moderation tools
    } catch (error) {
      logger.error({ error, reporterId, reportedUserId, reason }, 'Failed to report user');
      throw error;
    }
  }

  async getUserActivityStatus(userId: string): Promise<{
    isOnline: boolean;
    lastSeen: Date;
    currentActivity?: string;
  }> {
    try {
      const presence = await this.getUserPresence(userId);

      if (!presence) {
        return {
          isOnline: false,
          lastSeen: new Date(0) // Epoch time if never seen
        };
      }

      const isOnline = presence.status === 'online' &&
        (Date.now() - presence.lastSeen.getTime()) < 5 * 60 * 1000; // 5 minutes

      return {
        isOnline,
        lastSeen: presence.lastSeen,
        currentActivity: isOnline ? presence.status : undefined
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user activity status');
      return {
        isOnline: false,
        lastSeen: new Date(0)
      };
    }
  }

  private async getUserConversationIds(userId: string): Promise<string[]> {
    const conversations = await Conversation.find({
      'participants.user': userId,
      isActive: true
    }).select('_id');

    return conversations.map(c => c._id.toString());
  }

  private async clearUserCache(userId: string): Promise<void> {
    await redisHelpers.deleteCache(`user:${userId}`);
  }

  private async clearAllUserCaches(userId: string): Promise<void> {
    const patterns = [
      `user:${userId}`,
      `user_conversations:${userId}:*`,
      `user_stats:${userId}`,
      `session:*:${userId}`
    ];

    for (const pattern of patterns) {
      await redisHelpers.invalidatePattern(pattern);
    }
  }
}
