// apps/api/src/controllers/messages.controller.ts
import { Request, Response } from 'express';
import { Message } from '../models/Message.js';
import { Conversation } from '../models/Conversation.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../middlewares/error.js';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants.js';
import { MessageService } from '../services/message.service.js';
import type { SendMessageRequest, UpdateMessageRequest, AddReactionRequest } from '@chatverse/types';

const messageService = new MessageService();

export class MessagesController {
  // Get messages for a conversation
  getMessages = asyncHandler(async (req: Request, res: Response) => {
    const { conversationId } = req.params;
    const userId = (req as any).user?.id;
    const { limit, cursor } = req.query;

    const result = await messageService.getMessages(
      conversationId,
      userId,
      {
        limit: limit ? Number(limit) : undefined,
        cursor: cursor as string
      }
    );

    res.json({
      success: true,
      data: result.messages.map(msg => ({
        ...msg,
        id: msg._id?.toString() || msg.id
      })),
      meta: {
        hasMore: result.hasMore,
        nextCursor: result.nextCursor
      }
    });
  });

  // Get single message
  getMessage = asyncHandler(async (req: Request, res: Response) => {
    const { messageId } = req.params;
    const userId = (req as any).user?.id;

    const message = await messageService.getMessage(messageId, userId);

    if (!message) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.MESSAGE_NOT_FOUND,
          message: 'Message not found'
        }
      });
    }

    res.json({
      success: true,
      data: {
        ...message.toObject(),
        id: message._id.toString()
      }
    });
  });

  // Send new message (handled via Socket.io in real-time, but also available via REST)
  sendMessage = asyncHandler(async (req: Request<{ conversationId: string }, any, SendMessageRequest>, res: Response) => {
    const { conversationId } = req.params;
    const userId = (req as any).user?.id;
    const messageData = req.body;

    const message = await messageService.sendMessage(userId, conversationId, messageData);

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        ...message.toObject(),
        id: message._id.toString()
      }
    });
  });

  // Update message
  updateMessage = asyncHandler(async (req: Request<{ messageId: string }, any, UpdateMessageRequest>, res: Response) => {
    const { messageId } = req.params;
    const userId = (req as any).user?.id;
    const { content } = req.body;

    const message = await messageService.updateMessage(messageId, userId, content);

    res.json({
      success: true,
      data: {
        ...message.toObject(),
        id: message._id.toString()
      }
    });
  });

  // Delete message
  deleteMessage = asyncHandler(async (req: Request, res: Response) => {
    const { messageId } = req.params;
    const userId = (req as any).user?.id;

    await messageService.deleteMessage(messageId, userId);

    res.json({
      success: true,
      data: { message: 'Message deleted successfully' }
    });
  });

  // Add reaction to message
  addReaction = asyncHandler(async (req: Request<{ messageId: string }, any, AddReactionRequest>, res: Response) => {
    const { messageId } = req.params;
    const userId = (req as any).user?.id;
    const { emoji } = req.body;

    const message = await messageService.addReaction(messageId, userId, emoji);

    res.json({
      success: true,
      data: {
        ...message.toObject(),
        id: message._id.toString()
      }
    });
  });

  // Remove reaction from message
  removeReaction = asyncHandler(async (req: Request, res: Response) => {
    const { messageId, emoji } = req.params;
    const userId = (req as any).user?.id;

    const message = await messageService.removeReaction(messageId, userId, emoji);

    res.json({
      success: true,
      data: {
        ...message.toObject(),
        id: message._id.toString()
      }
    });
  });

  // Mark messages as read
  markAsRead = asyncHandler(async (req: Request, res: Response) => {
    const { conversationId } = req.params;
    const userId = (req as any).user?.id;
    const { messageIds } = req.body;

    await messageService.markMessagesAsRead(conversationId, userId, messageIds);

    res.json({
      success: true,
      data: { message: 'Messages marked as read' }
    });
  });

  // Search messages
  searchMessages = asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id;
    const { q: query, conversationId, limit, offset } = req.query;

    if (!query || (query as string).length < 2) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Search query must be at least 2 characters'
        }
      });
    }

    const result = await messageService.searchMessages(
      userId,
      query as string,
      {
        conversationId: conversationId as string,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined
      }
    );

    res.json({
      success: true,
      data: result.messages.map(msg => ({
        ...msg,
        id: msg._id?.toString() || msg.id
      })),
      meta: {
        total: result.total,
        query: query as string
      }
    });
  });

  // Get message statistics for a conversation
  getMessageStats = asyncHandler(async (req: Request, res: Response) => {
    const { conversationId } = req.params;
    const userId = (req as any).user?.id;

    const stats = await messageService.getMessageStats(conversationId, userId);

    res.json({
      success: true,
      data: stats
    });
  });

  // Get message delivery status (for message sender)
  getDeliveryStatus = asyncHandler(async (req: Request, res: Response) => {
    const { messageId } = req.params;
    const userId = (req as any).user?.id;

    const message = await Message.findOne({
      _id: messageId,
      senderId: userId,
      isDeleted: false
    }).populate('readBy.user', 'name avatar');

    if (!message) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.MESSAGE_NOT_FOUND,
          message: 'Message not found'
        }
      });
    }

    // Get conversation participants to determine delivery status
    const conversation = await Conversation.findById(message.conversationId)
      .populate('participants.user', 'name avatar');

    if (!conversation) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.CONVERSATION_NOT_FOUND,
          message: 'Conversation not found'
        }
      });
    }

    const deliveryStatus = conversation.participants
      .filter((p: any) => p.user._id.toString() !== userId)
      .map((participant: any) => {
        const readReceipt = message.readBy.find((r: any) =>
          r.user._id.toString() === participant.user._id.toString()
        );

        return {
          user: {
            id: participant.user._id.toString(),
            name: participant.user.name,
            avatar: participant.user.avatar
          },
          delivered: true, // Assume delivered if they're a participant
          read: !!readReceipt,
          readAt: readReceipt?.readAt || null
        };
      });

    res.json({
      success: true,
      data: {
        messageId: message._id.toString(),
        sentAt: message.createdAt,
        deliveryStatus
      }
    });
  });

  // Pin/unpin message (for group conversations)
  togglePinMessage = asyncHandler(async (req: Request, res: Response) => {
    const { messageId } = req.params;
    const userId = (req as any).user?.id;

    const message = await Message.findOne({
      _id: messageId,
      isDeleted: false
    });

    if (!message) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.MESSAGE_NOT_FOUND,
          message: 'Message not found'
        }
      });
    }

    // Check if user has permission to pin messages
    const conversation = await Conversation.findById(message.conversationId);
    if (!conversation) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.CONVERSATION_NOT_FOUND,
          message: 'Conversation not found'
        }
      });
    }

    const participant = conversation.getParticipant(userId);
    if (!participant || (conversation.type === 'group' && participant.role === 'member')) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: {
          code: ERROR_CODES.FORBIDDEN,
          message: 'Insufficient permissions to pin messages'
        }
      });
    }

    // Toggle pin status (this would require adding a 'pinned' field to Message model)
    const isPinned = (message as any).pinned || false;
    (message as any).pinned = !isPinned;
    await message.save();

    logger.info({
      userId,
      messageId,
      conversationId: message.conversationId,
      action: isPinned ? 'unpin' : 'pin'
    }, 'Message pin status toggled');

    res.json({
      success: true,
      data: {
        messageId: message._id.toString(),
        pinned: !isPinned,
        action: isPinned ? 'unpinned' : 'pinned'
      }
    });
  });

  // Get pinned messages for a conversation
  getPinnedMessages = asyncHandler(async (req: Request, res: Response) => {
    const { conversationId } = req.params;
    const userId = (req as any).user?.id;

    // Verify user is participant
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

    // Get pinned messages (this would require adding a 'pinned' field to Message model)
    const pinnedMessages = await Message.find({
      conversationId,
      pinned: true,
      isDeleted: false
    })
    .populate('senderId', 'name avatar')
    .sort({ createdAt: -1 })
    .limit(50);

    res.json({
      success: true,
      data: pinnedMessages.map(msg => ({
        ...msg.toObject(),
        id: msg._id.toString()
      }))
    });
  });
}
