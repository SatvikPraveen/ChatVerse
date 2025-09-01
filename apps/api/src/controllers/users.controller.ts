// apps/api/src/controllers/users.controller.ts
import { Request, Response } from 'express';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../middlewares/error.js';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants.js';
import type { UpdateProfileRequest, UpdateSettingsRequest } from '@chatverse/types';

export class UsersController {
  // Get user profile
  getProfile = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.USER_NOT_FOUND,
          message: 'User not found'
        }
      });
    }

    res.json({
      success: true,
      data: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        presence: user.presence,
        settings: user.settings,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  });

  // Update user profile
  updateProfile = asyncHandler(async (req: Request<{}, any, UpdateProfileRequest>, res: Response) => {
    const userId = (req as any).user?.id;
    const { name, email, avatar } = req.body;

    // Check if email is already taken by another user
    if (email) {
      const existingUser = await User.findOne({
        email,
        _id: { $ne: userId }
      });

      if (existingUser) {
        return res.status(HTTP_STATUS.CONFLICT).json({
          success: false,
          error: {
            code: ERROR_CODES.USER_EXISTS,
            message: 'Email already in use'
          }
        });
      }
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        ...(name && { name }),
        ...(email && { email }),
        ...(avatar !== undefined && { avatar })
      },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.USER_NOT_FOUND,
          message: 'User not found'
        }
      });
    }

    logger.info({ userId }, 'User profile updated');

    res.json({
      success: true,
      data: user.toPublicJSON()
    });
  });

  // Update user settings
  updateSettings = asyncHandler(async (req: Request<{}, any, UpdateSettingsRequest>, res: Response) => {
    const userId = (req as any).user?.id;
    const { notifications, privacy, theme } = req.body;

    const updateData: any = {};

    if (notifications) {
      if (notifications.push !== undefined) updateData['settings.notifications.push'] = notifications.push;
      if (notifications.email !== undefined) updateData['settings.notifications.email'] = notifications.email;
      if (notifications.sound !== undefined) updateData['settings.notifications.sound'] = notifications.sound;
    }

    if (privacy) {
      if (privacy.showOnlineStatus !== undefined) updateData['settings.privacy.showOnlineStatus'] = privacy.showOnlineStatus;
      if (privacy.allowMessageRequests !== undefined) updateData['settings.privacy.allowMessageRequests'] = privacy.allowMessageRequests;
    }

    if (theme) {
      updateData['settings.theme'] = theme;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.USER_NOT_FOUND,
          message: 'User not found'
        }
      });
    }

    logger.info({ userId }, 'User settings updated');

    res.json({
      success: true,
      data: user.toPublicJSON()
    });
  });

  // Search users
  searchUsers = asyncHandler(async (req: Request, res: Response) => {
    const { q: query, limit = 20 } = req.query;
    const userId = (req as any).user?.id;

    if (!query || (query as string).length < 2) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Search query must be at least 2 characters'
        }
      });
    }

    const users = await User.find({
      $and: [
        { _id: { $ne: userId } }, // Exclude current user
        { isActive: true },
        {
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { email: { $regex: query, $options: 'i' } }
          ]
        }
      ]
    })
    .select('name email avatar presence')
    .limit(Number(limit))
    .lean();

    res.json({
      success: true,
      data: users.map(user => ({
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        presence: user.presence
      }))
    });
  });

  // Get user by ID
  getUserById = asyncHandler(async (req: Request, res: Response) => {
    const { userId: targetUserId } = req.params;
    const userId = (req as any).user?.id;

    const user = await User.findOne({
      _id: targetUserId,
      isActive: true
    }).select('name avatar presence createdAt');

    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.USER_NOT_FOUND,
          message: 'User not found'
        }
      });
    }

    res.json({
      success: true,
      data: {
        id: user._id.toString(),
        name: user.name,
        avatar: user.avatar,
        presence: user.presence,
        createdAt: user.createdAt
      }
    });
  });

  // Get user's conversations count
  getStats = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;

    const stats = await Promise.all([
      // Total conversations
      import('../models/Conversation.js').then(({ Conversation }) =>
        Conversation.countDocuments({ 'participants.user': userId, isActive: true })
      ),
      // Total messages sent
      import('../models/Message.js').then(({ Message }) =>
        Message.countDocuments({ senderId: userId, isDeleted: false })
      )
    ]);

    res.json({
      success: true,
      data: {
        conversationsCount: stats[0],
        messagesSent: stats[1],
        memberSince: (await User.findById(userId))?.createdAt
      }
    });
  });

  // Delete user account
  deleteAccount = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        isActive: false,
        'presence.status': 'offline',
        email: `deleted_${userId}@deleted.com`, // Anonymize email
        name: 'Deleted User'
      },
      { new: true }
    );

    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.USER_NOT_FOUND,
          message: 'User not found'
        }
      });
    }

    logger.info({ userId }, 'User account deleted');

    res.json({
      success: true,
      data: { message: 'Account deleted successfully' }
    });
  });
}
