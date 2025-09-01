// apps/api/src/controllers/push.controller.ts
import { Request, Response } from 'express';
import webpush from 'web-push';
import { PushSubscription } from '../models/PushSubscription.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../middlewares/error.js';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants.js';
import { env } from '../config/env.js';

// Configure web-push
if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT) {
  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  );
}

export class PushController {
  // Subscribe to push notifications
  subscribe = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const { subscription } = req.body;

    try {
      // Save subscription to database
      const pushSubscription = new PushSubscription({
        userId,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        userAgent: req.headers['user-agent'],
      });

      await pushSubscription.save();

      logger.info({ userId, endpoint: subscription.endpoint }, 'Push subscription saved');

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        data: { message: 'Subscription saved successfully' }
      });
    } catch (error: any) {
      if (error.code === 11000) {
        // Duplicate subscription
        res.json({
          success: true,
          data: { message: 'Subscription already exists' }
        });
      } else {
        throw error;
      }
    }
  });

  // Unsubscribe from push notifications
  unsubscribe = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const { endpoint } = req.body;

    await PushSubscription.deleteOne({
      userId,
      endpoint
    });

    logger.info({ userId, endpoint }, 'Push subscription removed');

    res.json({
      success: true,
      data: { message: 'Unsubscribed successfully' }
    });
  });

  // Get user's push subscriptions
  getSubscriptions = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;

    const subscriptions = await PushSubscription.find({ userId })
      .select('-keys')
      .lean();

    res.json({
      success: true,
      data: subscriptions.map(sub => ({
        id: sub._id.toString(),
        endpoint: sub.endpoint,
        userAgent: sub.userAgent,
        createdAt: sub.createdAt
      }))
    });
  });

  // Test push notification (development only)
  testNotification = asyncHandler(async (req: Request, res: Response) => {
    if (env.NODE_ENV !== 'development') {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: {
          code: ERROR_CODES.FORBIDDEN,
          message: 'Test notifications only available in development'
        }
      });
    }

    const userId = (req as any).user?.id;
    const { title, body } = req.body;

    const subscriptions = await PushSubscription.find({ userId });

    if (subscriptions.length === 0) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: 'NO_SUBSCRIPTIONS',
          message: 'No push subscriptions found'
        }
      });
    }

    const payload = JSON.stringify({
      title,
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: {
        url: '/',
        timestamp: Date.now()
      }
    });

    const results = await Promise.allSettled(
      subscriptions.map(sub =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys
          },
          payload
        )
      )
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    logger.info({
      userId,
      total: subscriptions.length,
      successful,
      failed
    }, 'Test notifications sent');

    res.json({
      success: true,
      data: {
        message: 'Test notifications sent',
        total: subscriptions.length,
        successful,
        failed
      }
    });
  });

  // Send notification to user (internal method)
  static async sendNotificationToUser(
    userId: string,
    notification: {
      title: string;
      body: string;
      icon?: string;
      data?: any;
      actions?: Array<{ action: string; title: string }>;
    }
  ): Promise<void> {
    try {
      const subscriptions = await PushSubscription.find({ userId });

      if (subscriptions.length === 0) {
        logger.debug({ userId }, 'No push subscriptions found for user');
        return;
      }

      const payload = JSON.stringify({
        title: notification.title,
        body: notification.body,
        icon: notification.icon || '/favicon.ico',
        badge: '/favicon.ico',
        data: notification.data || {},
        actions: notification.actions || []
      });

      const results = await Promise.allSettled(
        subscriptions.map(async (sub) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: sub.keys
              },
              payload
            );
          } catch (error: any) {
            // Remove invalid subscriptions
            if (error.statusCode === 410) {
              await PushSubscription.deleteOne({ _id: sub._id });
              logger.info({ subscriptionId: sub._id }, 'Removed invalid subscription');
            }
            throw error;
          }
        })
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      logger.info({
        userId,
        total: subscriptions.length,
        successful,
        failed
      }, 'Push notifications sent');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to send push notification');
    }
  }
}
