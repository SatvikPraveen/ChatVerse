// apps/api/src/tests/unit/message.service.test.ts
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { MessageService } from '../../services/message.service.js';
import { User } from '../../models/User.js';
import { Conversation } from '../../models/Conversation.js';
import { Message } from '../../models/Message.js';
import '../setup.js';

// Mock dependencies
jest.mock('../../db/redis.js', () => ({
  redisHelpers: {
    getCache: jest.fn(),
    setCache: jest.fn(),
    deleteCache: jest.fn(),
    invalidatePattern: jest.fn()
  }
}));

jest.mock('../../controllers/push.controller.js', () => ({
  PushController: {
    sendNotificationToUser: jest.fn()
  }
}));

describe('MessageService', () => {
  let messageService: MessageService;
  let testUser1: any, testUser2: any;
  let testConversation: any;

  beforeEach(async () => {
    messageService = new MessageService();

    // Create test users
    testUser1 = new User({
      name: 'User 1',
      email: 'user1@example.com',
      password: 'password123'
    });
    await testUser1.save();

    testUser2 = new User({
      name: 'User 2',
      email: 'user2@example.com',
      password: 'password123'
    });
    await testUser2.save();

    // Create test conversation
    testConversation = new Conversation({
      type: 'direct',
      participants: [
        { user: testUser1._id, role: 'member' },
        { user: testUser2._id, role: 'member' }
      ]
    });
    await testConversation.save();

    jest.clearAllMocks();
  });

  describe('sendMessage', () => {
    test('should send message successfully', async () => {
      const messageData = {
        content: 'Hello, world!',
        type: 'text' as const
      };

      const message = await messageService.sendMessage(
        testUser1._id.toString(),
        testConversation._id.toString(),
        messageData
      );

      expect(message.content).toBe(messageData.content);
      expect(message.senderId.toString()).toBe(testUser1._id.toString());
      expect(message.conversationId.toString()).toBe(testConversation._id.toString());
      expect(message.type).toBe('text');
    });

    test('should throw error for non-participant', async () => {
      const nonParticipant = new User({
        name: 'Non Participant',
        email: 'non@example.com',
        password: 'password123'
      });
      await nonParticipant.save();

      const messageData = {
        content: 'Hello, world!',
        type: 'text' as const
      };

      await expect(messageService.sendMessage(
        nonParticipant._id.toString(),
        testConversation._id.toString(),
        messageData
      )).rejects.toThrow();
    });

    test('should update conversation last message', async () => {
      const messageData = {
        content: 'Hello, world!',
        type: 'text' as const
      };

      await messageService.sendMessage(
        testUser1._id.toString(),
        testConversation._id.toString(),
        messageData
      );

      const updatedConversation = await Conversation.findById(testConversation._id);
      expect(updatedConversation?.lastMessage?.content).toBe(messageData.content);
      expect(updatedConversation?.lastMessage?.sender.toString()).toBe(testUser1._id.toString());
    });
  });

  describe('getMessages', () => {
    beforeEach(async () => {
      // Create test messages
      const messages = [
        { content: 'Message 1', senderId: testUser1._id },
        { content: 'Message 2', senderId: testUser2._id },
        { content: 'Message 3', senderId: testUser1._id }
      ];

      for (const msgData of messages) {
        const message = new Message({
          ...msgData,
          conversationId: testConversation._id,
          type: 'text'
        });
        await message.save();
      }
    });

    test('should get messages for participant', async () => {
      const result = await messageService.getMessages(
        testConversation._id.toString(),
        testUser1._id.toString()
      );

      expect(result.messages).toHaveLength(3);
      expect(result.messages[0].content).toBe('Message 3'); // Most recent first
    });

    test('should throw error for non-participant', async () => {
      const nonParticipant = new User({
        name: 'Non Participant',
        email: 'non@example.com',
        password: 'password123'
      });
      await nonParticipant.save();

      await expect(messageService.getMessages(
        testConversation._id.toString(),
        nonParticipant._id.toString()
      )).rejects.toThrow();
    });

    test('should respect limit parameter', async () => {
      const result = await messageService.getMessages(
        testConversation._id.toString(),
        testUser1._id.toString(),
        { limit: 2 }
      );

      expect(result.messages).toHaveLength(2);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('updateMessage', () => {
    let testMessage: any;

    beforeEach(async () => {
      testMessage = new Message({
        conversationId: testConversation._id,
        senderId: testUser1._id,
        content: 'Original content',
        type: 'text'
      });
      await testMessage.save();
    });

    test('should update message by sender', async () => {
      const newContent = 'Updated content';

      const updatedMessage = await messageService.updateMessage(
        testMessage._id.toString(),
        testUser1._id.toString(),
        newContent
      );

      expect(updatedMessage.content).toBe(newContent);
      expect(updatedMessage.isEdited).toBe(true);
    });

    test('should throw error when non-sender tries to update', async () => {
      await expect(messageService.updateMessage(
        testMessage._id.toString(),
        testUser2._id.toString(),
        'Updated content'
      )).rejects.toThrow();
    });
  });

  describe('deleteMessage', () => {
    let testMessage: any;

    beforeEach(async () => {
      testMessage = new Message({
        conversationId: testConversation._id,
        senderId: testUser1._id,
        content: 'Message to delete',
        type: 'text'
      });
      await testMessage.save();
    });

    test('should soft delete message by sender', async () => {
      await messageService.deleteMessage(
        testMessage._id.toString(),
        testUser1._id.toString()
      );

      const deletedMessage = await Message.findById(testMessage._id);
      expect(deletedMessage?.isDeleted).toBe(true);
      expect(deletedMessage?.content).toBe('This message has been deleted');
    });

    test('should throw error when non-sender tries to delete', async () => {
      await expect(messageService.deleteMessage(
        testMessage._id.toString(),
        testUser2._id.toString()
      )).rejects.toThrow();
    });
  });

  describe('addReaction', () => {
    let testMessage: any;

    beforeEach(async () => {
      testMessage = new Message({
        conversationId: testConversation._id,
        senderId: testUser1._id,
        content: 'Message with reactions',
        type: 'text'
      });
      await testMessage.save();
    });

    test('should add reaction to message', async () => {
      const emoji = '👍';

      const updatedMessage = await messageService.addReaction(
        testMessage._id.toString(),
        testUser2._id.toString(),
        emoji
      );

      const reaction = updatedMessage.reactions?.find(r => r.emoji === emoji);
      expect(reaction).toBeDefined();
      expect(reaction?.count).toBe(1);
      expect(reaction?.users).toContain(testUser2._id.toString());
    });

    test('should increment reaction count if user reacts with same emoji', async () => {
      const emoji = '👍';

      // First reaction
      await messageService.addReaction(
        testMessage._id.toString(),
        testUser1._id.toString(),
        emoji
      );

      // Second reaction from different user
      const updatedMessage = await messageService.addReaction(
        testMessage._id.toString(),
        testUser2._id.toString(),
        emoji
      );

      const reaction = updatedMessage.reactions?.find(r => r.emoji === emoji);
      expect(reaction?.count).toBe(2);
    });
  });

  describe('searchMessages', () => {
    beforeEach(async () => {
      // Create messages with searchable content
      const messages = [
        { content: 'Hello world', senderId: testUser1._id },
        { content: 'JavaScript programming', senderId: testUser2._id },
        { content: 'Hello JavaScript', senderId: testUser1._id },
        { content: 'Random message', senderId: testUser2._id }
      ];

      for (const msgData of messages) {
        const message = new Message({
          ...msgData,
          conversationId: testConversation._id,
          type: 'text'
        });
        await message.save();
      }

      // Wait a bit for text indexing
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    test('should search messages by content', async () => {
      const result = await messageService.searchMessages(
        testUser1._id.toString(),
        'JavaScript'
      );

      expect(result.messages.length).toBeGreaterThanOrEqual(1);
      expect(result.messages.some(m => m.content.includes('JavaScript'))).toBe(true);
    });

    test('should search within specific conversation', async () => {
      const result = await messageService.searchMessages(
        testUser1._id.toString(),
        'Hello',
        { conversationId: testConversation._id.toString() }
      );

      expect(result.messages.length).toBeGreaterThanOrEqual(1);
      expect(result.messages.every(m =>
        m.conversationId.toString() === testConversation._id.toString()
      )).toBe(true);
    });
  });
});
