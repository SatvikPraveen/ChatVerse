// apps/api/src/realtime/events.chat.ts
import { Socket } from 'socket.io';
import { Message } from '../models/Message.js';
import { Conversation } from '../models/Conversation.js';
import { logger } from '../utils/logger.js';
import { io } from './io.js';
import type { MessageSendEvent, ConversationJoinEvent, ConversationLeaveEvent } from '@chatverse/types';

export function setupChatEvents(socket: Socket) {
  const user = socket.user!;

  // Join conversation room
  socket.on('conversation:join', async (data: ConversationJoinEvent) => {
    try {
      const { conversationId } = data;

      // Verify user is participant
      const conversation = await Conversation.findById(conversationId);
      if (!conversation || !conversation.hasParticipant(user.id)) {
        socket.emit('error', {
          code: 'UNAUTHORIZED',
          message: 'Not authorized to join this conversation',
        });
        return;
      }

      // Join socket room
      socket.join(`conversation:${conversationId}`);

      logger.info({
        userId: user.id,
        conversationId,
      }, 'User joined conversation');

    } catch (error) {
      logger.error({ error, userId: user.id }, 'Failed to join conversation');
      socket.emit('error', {
        code: 'JOIN_CONVERSATION_FAILED',
        message: 'Failed to join conversation',
      });
    }
  });

  // Leave conversation room
  socket.on('conversation:leave', async (data: ConversationLeaveEvent) => {
    try {
      const { conversationId } = data;

      // Leave socket room
      socket.leave(`conversation:${conversationId}`);

      logger.info({
        userId: user.id,
        conversationId,
      }, 'User left conversation');

    } catch (error) {
      logger.error({ error, userId: user.id }, 'Failed to leave conversation');
    }
  });

  // Send message
  socket.on('message:send', async (data: MessageSendEvent) => {
    try {
      const { conversationId, content, type = 'text', attachments, replyTo } = data;

      // Verify user is participant
      const conversation = await Conversation.findById(conversationId);
      if (!conversation || !conversation.hasParticipant(user.id)) {
        socket.emit('error', {
          code: 'UNAUTHORIZED',
          message: 'Not authorized to send messages to this conversation',
        });
        return;
      }

      // Create message
      const message = new Message({
        conversationId,
        senderId: user.id,
        content,
        type,
        attachments,
        replyTo,
      });

      await message.save();

      // Populate sender info
      await message.populate('senderId', 'name email avatar');

      // Update conversation last message
      conversation.lastMessage = {
        content: content,
        sender: user.id,
        timestamp: message.createdAt,
        type: type,
      };

      // Update unread counts for other participants
      conversation.participants.forEach((participant: any) => {
        if (participant.user.toString() !== user.id) {
          conversation.incrementUnreadCount(participant.user.toString());
        }
      });

      await conversation.save();

      // Broadcast message to conversation room
      io.to(`conversation:${conversationId}`).emit('message:new', {
        message: message.toPublicJSON(),
        conversationId,
      });

      logger.info({
        userId: user.id,
        conversationId,
        messageId: message._id,
      }, 'Message sent');

    } catch (error) {
      logger.error({ error, userId: user.id }, 'Failed to send message');
      socket.emit('error', {
        code: 'MESSAGE_SEND_FAILED',
        message: 'Failed to send message',
      });
    }
  });

  // Add message reaction
  socket.on('message:reaction:add', async (data) => {
    try {
      const { messageId, conversationId, emoji } = data;

      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit('error', {
          code: 'MESSAGE_NOT_FOUND',
          message: 'Message not found',
        });
        return;
      }

      // Verify user is participant
      const conversation = await Conversation.findById(conversationId);
      if (!conversation || !conversation.hasParticipant(user.id)) {
        socket.emit('error', {
          code: 'UNAUTHORIZED',
          message: 'Not authorized',
        });
        return;
      }

      message.addReaction(emoji, user.id);
      await message.save();

      // Broadcast reaction update
      io.to(`conversation:${conversationId}`).emit('message:updated', {
        message: message.toPublicJSON(),
        conversationId,
      });

      logger.info({
        userId: user.id,
        messageId,
        emoji,
      }, 'Reaction added');

    } catch (error) {
      logger.error({ error, userId: user.id }, 'Failed to add reaction');
      socket.emit('error', {
        code: 'REACTION_ADD_FAILED',
        message: 'Failed to add reaction',
      });
    }
  });

  // Remove message reaction
  socket.on('message:reaction:remove', async (data) => {
    try {
      const { messageId, conversationId, emoji } = data;

      const message = await Message.findById(messageId);
      if (!message) {
        socket.emit('error', {
          code: 'MESSAGE_NOT_FOUND',
          message: 'Message not found',
        });
        return;
      }

      // Verify user is participant
      const conversation = await Conversation.findById(conversationId);
      if (!conversation || !conversation.hasParticipant(user.id)) {
        socket.emit('error', {
          code: 'UNAUTHORIZED',
          message: 'Not authorized',
        });
        return;
      }

      message.removeReaction(emoji, user.id);
      await message.save();

      // Broadcast reaction update
      io.to(`conversation:${conversationId}`).emit('message:updated', {
        message: message.toPublicJSON(),
        conversationId,
      });

      logger.info({
        userId: user.id,
        messageId,
        emoji,
      }, 'Reaction removed');

    } catch (error) {
      logger.error({ error, userId: user.id }, 'Failed to remove reaction');
      socket.emit('error', {
        code: 'REACTION_REMOVE_FAILED',
        message: 'Failed to remove reaction',
      });
    }
  });
}
