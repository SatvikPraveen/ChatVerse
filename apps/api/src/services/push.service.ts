// apps/api/src/services/push.service.ts
import webpush from 'web-push';
import { PushSubscription } from '../models/PushSubscription.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';
import { redisHelpers } from '../db/redis.js';
import { env } from '../config/env.js';
import { AppMetrics } from '../telemetry/metrics.js';
import { ERROR_CODES } from '../config/constants.js';

// Configure web-push with VAPID keys
if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT) {
  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  );
}

export interface PushNotificationData {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  data?: Record<string, any>;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
  requireInteraction?: boolean;
  silent?: boolean;
  tag?: string;
}

export class PushService {
  async subscribe(userId: string, subscription: any, userAgent?: string): Promise<void> {
    try {
      // Validate subscription format
      if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
        throw new Error('Invalid subscription format');
      }

      // Check if subscription already exists
      const existing = await PushSubscription.findOne({
        userId,
        endpoint: subscription.endpoint
      });

      if (existing) {
        logger.debug({ userId, endpoint: subscription.endpoint }, 'Push subscription already exists');
        return;
      }

      // Create new subscription
      const pushSubscription = new PushSubscription({
        userId,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        userAgent
      });

      await pushSubscription.save();

      logger.info({
        userId,
        endpoint: subscription.endpoint.substring(0, 50) + '...'
      }, 'Push subscription created');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to create push subscription');
      AppMetrics.recordError('push', 'subscribe');
      throw error;
    }
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    try {
      const result = await PushSubscription.deleteOne({
        userId,
        endpoint
      });

      if (result.deletedCount > 0) {
        logger.info({ userId, endpoint: endpoint.substring(0, 50) + '...' }, 'Push subscription removed');
      }
    } catch (error) {
      logger.error({ error, userId, endpoint }, 'Failed to remove push subscription');
      throw error;
    }
  }

  async getUserSubscriptions(userId: string): Promise<any[]> {
    try {
      const subscriptions = await PushSubscription.find({ userId })
        .select('-keys') // Don't return sensitive keys
        .lean();

      return subscriptions.map(sub => ({
        id: sub._id.toString(),
        endpoint: sub.endpoint,
        userAgent: sub.userAgent,
        createdAt: sub.createdAt
      }));
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get user subscriptions');
      return [];
    }
  }

  async sendNotificationToUser(userId: string, notification: PushNotificationData): Promise<{
    successful: number;
    failed: number;
    errors: string[];
  }> {
    try {
      // Check if user has push notifications enabled
      const user = await User.findById(userId).select('settings.notifications.push');
      if (!user?.settings.notifications.push) {
        logger.debug({ userId }, 'User has push notifications disabled');
        return { successful: 0, failed: 0, errors: ['Push notifications disabled'] };
      }

      const subscriptions = await PushSubscription.find({ userId });

      if (subscriptions.length === 0) {
        logger.debug({ userId }, 'No push subscriptions found for user');
        return { successful: 0, failed: 0, errors: ['No subscriptions found'] };
      }

      const payload = JSON.stringify({
        title: notification.title,
        body: notification.body,
        icon: notification.icon || '/favicon.ico',
        badge: notification.badge || '/favicon.ico',
        image: notification.image,
        data: notification.data || {},
        actions: notification.actions || [],
        requireInteraction: notification.requireInteraction || false,
        silent: notification.silent || false,
        tag: notification.tag
      });

      const results = await Promise.allSettled(
        subscriptions.map(sub => this.sendToSubscription(sub, payload))
      );

      let successful = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const result of results) {
        if (result.status === 'fulfilled') {
          successful++;
        } else {
          failed++;
          errors.push(result.reason?.message || 'Unknown error');
        }
      }

      logger.info({
        userId,
        title: notification.title,
        total: subscriptions.length,
        successful,
        failed
      }, 'Push notification sent');

      return { successful, failed, errors };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to send push notification');
      AppMetrics.recordError('push', 'send_notification');
      return { successful: 0, failed: 1, errors: [(error as Error).message] };
    }
  }

  async sendNotificationToMultipleUsers(
    userIds: string[],
    notification: PushNotificationData
  ): Promise<{
    totalUsers: number;
    successful: number;
    failed: number;
    errors: Record<string, string[]>;
  }> {
    const results = await Promise.allSettled(
      userIds.map(userId => this.sendNotificationToUser(userId, notification))
    );

    let totalSuccessful = 0;
    let totalFailed = 0;
    const errors: Record<string, string[]> = {};

    results.forEach((result, index) => {
      const userId = userIds[index];

      if (result.status === 'fulfilled') {
        totalSuccessful += result.value.successful;
        totalFailed += result.value.failed;
        if (result.value.errors.length > 0) {
          errors[userId] = result.value.errors;
        }
      } else {
        totalFailed++;
        errors[userId] = [result.reason?.message || 'Unknown error'];
      }
    });

    logger.info({
      userCount: userIds.length,
      title: notification.title,
      totalSuccessful,
      totalFailed
    }, 'Bulk push notification sent');

    return {
      totalUsers: userIds.length,
      successful: totalSuccessful,
      failed: totalFailed,
      errors
    };
  }

  async sendMessageNotification(
    userId: string,
    senderName: string,
    messageContent: string,
    conversationId: string,
    messageId: string
  ): Promise<void> {
    const notification: PushNotificationData = {
      title: senderName,
      body: messageContent.length > 100
        ? `${messageContent.substring(0, 100)}...`
        : messageContent,
      icon: '/favicon.ico',
      tag: `message_${conversationId}`,
      data: {
        type: 'message',
        conversationId,
        messageId,
        url: `/chat/${conversationId}`
      },
      actions: [
        {
          action: 'reply',
          title: 'Reply'
        },
        {
          action: 'open',
          title: 'Open Chat'
        }
      ]
    };

    await this.sendNotificationToUser(userId, notification);
  }

  async sendSystemNotification(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, any>
  ): Promise<void> {
    const notification: PushNotificationData = {
      title,
      body,
      icon: '/favicon.ico',
      tag: 'system',
      data: {
        type: 'system',
        ...data
      }
    };

    await this.sendNotificationToUser(userId, notification);
  }

  async cleanupInvalidSubscriptions(): Promise<void> {
    try {
      const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

      const result = await PushSubscription.deleteMany({
        createdAt: { $lt: cutoffDate }
      });

      logger.info({ deletedCount: result.deletedCount }, 'Cleaned up old push subscriptions');
    } catch (error) {
      logger.error({ error }, 'Failed to cleanup push subscriptions');
    }
  }

  private async sendToSubscription(subscription: any, payload: string): Promise<void> {
    try {
      const response = await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: subscription.keys
        },
        payload,
        {
          TTL: 24 * 60 * 60, // 24 hours
          urgency: 'normal'
        }
      );

      // Track successful delivery
      AppMetrics.recordMessage('sent');
    } catch (error: any) {
      // Handle invalid subscriptions
      if (error.statusCode === 410 || error.statusCode === 404) {
        // Subscription is no longer valid, remove it
        await PushSubscription.deleteOne({ _id: subscription._id });
        logger.info({ subscriptionId: subscription._id }, 'Removed invalid push subscription');
      } else if (error.statusCode === 429) {
        // Rate limited, should implement exponential backoff
        logger.warn({ subscriptionId: subscription._id }, 'Push service rate limited');
      } else {
        logger.error({
          error: error.message,
          statusCode: error.statusCode,
          subscriptionId: subscription._id
        }, 'Push notification failed');
      }

      throw error;
    }
  }

  async getDeliveryStats(userId?: string): Promise<{
    totalSubscriptions: number;
    activeSubscriptions: number;
    userSubscriptions?: number;
  }> {
    try {
      const [total, active, userSubs] = await Promise.all([
        PushSubscription.countDocuments({}),
        PushSubscription.countDocuments({
          createdAt: { $gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Active in last 7 days
        }),
        userId ? PushSubscription.countDocuments({ userId }) : Promise.resolve(0)
      ]);

      return {
        totalSubscriptions: total,
        activeSubscriptions: active,
        ...(userId && { userSubscriptions: userSubs })
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get delivery stats');
      return {
        totalSubscriptions: 0,
        activeSubscriptions: 0,
        ...(userId && { userSubscriptions: 0 })
      };
    }
  }
}

export const pushService = new PushService();

// Schedule periodic cleanup
if (env.NODE_ENV === 'production') {
  setInterval(async () => {
    await pushService.cleanupInvalidSubscriptions();
  }, 24 * 60 * 60 * 1000); // Once per day
}
