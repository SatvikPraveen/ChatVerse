// apps/api/src/controllers/conversations.controller.ts
import { Request, Response } from 'express';
import { Conversation } from '../models/Conversation.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../middlewares/error.js';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants.js';
import type { CreateConversationRequest, UpdateConversationRequest, AddParticipantRequest } from '@chatverse/types';

export class ConversationsController {
  // Get user's conversations
  getConversations = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const { limit = 20, cursor } = req.query;

    const query: any = {
      'participants.user': userId,
      isActive: true
    };

    if (cursor) {
      query.updatedAt = { $lt: new Date(cursor as string) };
    }

    const conversations = await Conversation.find(query)
      .populate('participants.user', 'name email avatar presence')
      .sort({ updatedAt: -1 })
      .limit(Number(limit))
      .lean();

    const hasMore = conversations.length === Number(limit);
    const nextCursor = hasMore ? conversations[conversations.length - 1].updatedAt : null;

    res.json({
      success: true,
      data: conversations.map(conv => ({
        ...conv,
        id: conv._id.toString()
      })),
      meta: {
        hasMore,
        nextCursor,
        total: await Conversation.countDocuments({ 'participants.user': userId, isActive: true })
      }
    });
  });

  // Get single conversation
  getConversation = asyncHandler(async (req: Request, res: Response) => {
    const { conversationId } = req.params;
    const userId = (req as any).user?.id;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': userId,
      isActive: true
    }).populate('participants.user', 'name email avatar presence');

    if (!conversation) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.CONVERSATION_NOT_FOUND,
          message: 'Conversation not found'
        }
      });
    }

    res.json({
      success: true,
      data: conversation.toPublicJSON()
    });
  });

  // Create new conversation
  createConversation = asyncHandler(async (req: Request<{}, any, CreateConversationRequest>, res: Response) => {
    const userId = (req as any).user?.id;
    const { type, name, description, participants } = req.body;

    // Validate participants
    const participantUsers = await User.find({ _id: { $in: participants } });
    if (participantUsers.length !== participants.length) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: {
          code: ERROR_CODES.USER_NOT_FOUND,
          message: 'One or more participants not found'
        }
      });
    }

    // For direct conversations, check if one already exists
    if (type === 'direct') {
      if (participants.length !== 1) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Direct conversations require exactly one other participant'
          }
        });
      }

      const existingConversation = await Conversation.findOne({
        type: 'direct',
        $and: [
          { 'participants.user': userId },
          { 'participants.user': participants[0] }
        ]
      });

      if (existingConversation) {
        return res.json({
          success: true,
          data: existingConversation.toPublicJSON()
        });
      }
    }

    // Create conversation
    const conversation = new Conversation({
      type,
      name,
      description,
      participants: [
        { user: userId, role: type === 'group' ? 'owner' : 'member' },
        ...participants.map((pid: string) => ({ user: pid, role: 'member' }))
      ]
    });

    await conversation.save();
    await conversation.populate('participants.user', 'name email avatar presence');

    logger.info({ userId, conversationId: conversation._id, type }, 'Conversation created');

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: conversation.toPublicJSON()
    });
  });

  // Update conversation
  updateConversation = asyncHandler(async (req: Request<{ conversationId: string }, any, UpdateConversationRequest>, res: Response) => {
    const { conversationId } = req.params;
    const userId = (req as any).user?.id;
    const updates = req.body;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': userId,
      isActive: true
    });

    if (!conversation) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.CONVERSATION_NOT_FOUND,
          message: 'Conversation not found'
        }
      });
    }

    // Check if user has permission to update (owner or admin for groups)
    const participant = conversation.getParticipant(userId);
    if (conversation.type === 'group' && participant?.role === 'member') {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: {
          code: ERROR_CODES.FORBIDDEN,
          message: 'Insufficient permissions'
        }
      });
    }

    Object.assign(conversation, updates);
    await conversation.save();

    logger.info({ userId, conversationId }, 'Conversation updated');

    res.json({
      success: true,
      data: conversation.toPublicJSON()
    });
  });

  // Add participant to conversation
  addParticipant = asyncHandler(async (req: Request<{ conversationId: string }, any, AddParticipantRequest>, res: Response) => {
    const { conversationId } = req.params;
    const userId = (req as any).user?.id;
    const { userId: newUserId, role = 'member' } = req.body;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': userId,
      isActive: true
    });

    if (!conversation) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.CONVERSATION_NOT_FOUND,
          message: 'Conversation not found'
        }
      });
    }

    // Check permissions
    const participant = conversation.getParticipant(userId);
    if (participant?.role === 'member') {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: {
          code: ERROR_CODES.FORBIDDEN,
          message: 'Insufficient permissions'
        }
      });
    }

    // Validate new user exists
    const newUser = await User.findById(newUserId);
    if (!newUser) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.USER_NOT_FOUND,
          message: 'User not found'
        }
      });
    }

    try {
      conversation.addParticipant(newUserId, role);
      await conversation.save();

      logger.info({ userId, conversationId, newUserId }, 'Participant added to conversation');

      res.json({
        success: true,
        data: { message: 'Participant added successfully' }
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: error.message
        }
      });
    }
  });

  // Remove participant from conversation
  removeParticipant = asyncHandler(async (req: Request, res: Response) => {
    const { conversationId, participantId } = req.params;
    const userId = (req as any).user?.id;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': userId,
      isActive: true
    });

    if (!conversation) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.CONVERSATION_NOT_FOUND,
          message: 'Conversation not found'
        }
      });
    }

    // Check permissions (can remove self, or admins/owners can remove others)
    const participant = conversation.getParticipant(userId);
    if (participantId !== userId && participant?.role === 'member') {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: {
          code: ERROR_CODES.FORBIDDEN,
          message: 'Insufficient permissions'
        }
      });
    }

    conversation.removeParticipant(participantId);
    await conversation.save();

    logger.info({ userId, conversationId, participantId }, 'Participant removed from conversation');

    res.json({
      success: true,
      data: { message: 'Participant removed successfully' }
    });
  });

  // Delete conversation
  deleteConversation = asyncHandler(async (req: Request, res: Response) => {
    const { conversationId } = req.params;
    const userId = (req as any).user?.id;

    const conversation = await Conversation.findOne({
      _id: conversationId,
      'participants.user': userId,
      isActive: true
    });

    if (!conversation) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.CONVERSATION_NOT_FOUND,
          message: 'Conversation not found'
        }
      });
    }

    // Only owners can delete group conversations
    if (conversation.type === 'group') {
      const participant = conversation.getParticipant(userId);
      if (participant?.role !== 'owner') {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          error: {
            code: ERROR_CODES.FORBIDDEN,
            message: 'Only owners can delete group conversations'
          }
        });
      }
    }

    conversation.isActive = false;
    await conversation.save();

    logger.info({ userId, conversationId }, 'Conversation deleted');

    res.json({
      success: true,
      data: { message: 'Conversation deleted successfully' }
    });
  });
}
