// apps/api/src/tests/integration/messages.integration.test.ts
import { describe, test, expect, beforeEach, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../server.js';
import { User } from '../../models/User.js';
import { Conversation } from '../../models/Conversation.js';
import { Message } from '../../models/Message.js';
import '../setup.js';

describe('Messages Integration Tests', () => {
  let app: any;
  let server: any;
  let user1Token: string, user2Token: string;
  let user1Id: string, user2Id: string;
  let conversationId: string;

  beforeAll(async () => {
    app = createApp();
    server = app.listen(0);
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  beforeEach(async () => {
    // Clean up
    await Promise.all([
      User.deleteMany({}),
      Conversation.deleteMany({}),
      Message.deleteMany({})
    ]);

    // Create test users
    const user1Response = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'User 1',
        email: 'user1@example.com',
        password: 'password123'
      });

    const user2Response = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'User 2',
        email: 'user2@example.com',
        password: 'password123'
      });

    user1Token = user1Response.body.data.token;
    user2Token = user2Response.body.data.token;
    user1Id = user1Response.body.data.user.id;
    user2Id = user2Response.body.data.user.id;

    // Create test conversation
    const conversationResponse = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        type: 'direct',
        participants: [user2Id]
      });

    conversationId = conversationResponse.body.data.id;
  });

  describe('GET /api/messages/conversation/:conversationId', () => {
    beforeEach(async () => {
      // Create test messages
      const messages = [
        { content: 'Message 1', senderId: user1Id },
        { content: 'Message 2', senderId: user2Id },
        { content: 'Message 3', senderId: user1Id }
      ];

      for (const msgData of messages) {
        await request(app)
          .post(`/api/messages/conversation/${conversationId}`)
          .set('Authorization', `Bearer ${msgData.senderId === user1Id ? user1Token : user2Token}`)
          .send({
            content: msgData.content,
            type: 'text'
          });
      }
    });

    test('should get messages for participant', async () => {
      const response = await request(app)
        .get(`/api/messages/conversation/${conversationId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.data[0].content).toBe('Message 3'); // Most recent first
    });

    test('should reject non-participant', async () => {
      // Create another user who is not in the conversation
      const user3Response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'User 3',
          email: 'user3@example.com',
          password: 'password123'
        });

      const response = await request(app)
        .get(`/api/messages/conversation/${conversationId}`)
        .set('Authorization', `Bearer ${user3Response.body.data.token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    test('should respect limit parameter', async () => {
      const response = await request(app)
        .get(`/api/messages/conversation/${conversationId}?limit=2`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.hasMore).toBe(true);
    });
  });

  describe('POST /api/messages/conversation/:conversationId', () => {
    test('should send message successfully', async () => {
      const messageData = {
        content: 'Hello, world!',
        type: 'text'
      };

      const response = await request(app)
        .post(`/api/messages/conversation/${conversationId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send(messageData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.content).toBe(messageData.content);
      expect(response.body.data.type).toBe('text');
    });

    test('should validate message content', async () => {
      const response = await request(app)
        .post(`/api/messages/conversation/${conversationId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          content: '', // Empty content
          type: 'text'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should reject non-participant', async () => {
      const user3Response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'User 3',
          email: 'user3@example.com',
          password: 'password123'
        });

      const response = await request(app)
        .post(`/api/messages/conversation/${conversationId}`)
        .set('Authorization', `Bearer ${user3Response.body.data.token}`)
        .send({
          content: 'Hello',
          type: 'text'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    test('should update conversation last message', async () => {
      const messageData = {
        content: 'Latest message',
        type: 'text'
      };

      await request(app)
        .post(`/api/messages/conversation/${conversationId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send(messageData)
        .expect(201);

      // Get updated conversation
      const conversationResponse = await request(app)
        .get(`/api/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(conversationResponse.body.data.lastMessage.content).toBe(messageData.content);
    });
  });

  describe('PUT /api/messages/:messageId', () => {
    let messageId: string;

    beforeEach(async () => {
      const messageResponse = await request(app)
        .post(`/api/messages/conversation/${conversationId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          content: 'Original content',
          type: 'text'
        });

      messageId = messageResponse.body.data.id;
    });

    test('should update message by sender', async () => {
      const newContent = 'Updated content';

      const response = await request(app)
        .put(`/api/messages/${messageId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ content: newContent })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.content).toBe(newContent);
      expect(response.body.data.isEdited).toBe(true);
    });

    test('should reject update by non-sender', async () => {
      const response = await request(app)
        .put(`/api/messages/${messageId}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ content: 'Updated content' })
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/messages/:messageId', () => {
    let messageId: string;

    beforeEach(async () => {
      const messageResponse = await request(app)
        .post(`/api/messages/conversation/${conversationId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          content: 'Message to delete',
          type: 'text'
        });

      messageId = messageResponse.body.data.id;
    });

    test('should delete message by sender', async () => {
      const response = await request(app)
        .delete(`/api/messages/${messageId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify message is soft deleted
      const message = await Message.findById(messageId);
      expect(message?.isDeleted).toBe(true);
    });

    test('should reject delete by non-sender', async () => {
      const response = await request(app)
        .delete(`/api/messages/${messageId}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/messages/:messageId/reactions', () => {
    let messageId: string;

    beforeEach(async () => {
      const messageResponse = await request(app)
        .post(`/api/messages/conversation/${conversationId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          content: 'React to this message',
          type: 'text'
        });

      messageId = messageResponse.body.data.id;
    });

    test('should add reaction to message', async () => {
      const response = await request(app)
        .post(`/api/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ emoji: '👍' })
        .expect(200);

      expect(response.body.success).toBe(true);

      const reaction = response.body.data.reactions.find((r: any) => r.emoji === '👍');
      expect(reaction).toBeDefined();
      expect(reaction.count).toBe(1);
    });

    test('should increment reaction count', async () => {
      // First user reacts
      await request(app)
        .post(`/api/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ emoji: '👍' })
        .expect(200);

      // Second user reacts with same emoji
      const response = await request(app)
        .post(`/api/messages/${messageId}/reactions`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ emoji: '👍' })
        .expect(200);

      const reaction = response.body.data.reactions.find((r: any) => r.emoji === '👍');
      expect(reaction.count).toBe(2);
    });
  });

  describe('POST /api/messages/conversation/:conversationId/read', () => {
    let messageIds: string[];

    beforeEach(async () => {
      // Create multiple messages
      const responses = await Promise.all([
        request(app)
          .post(`/api/messages/conversation/${conversationId}`)
          .set('Authorization', `Bearer ${user1Token}`)
          .send({ content: 'Message 1', type: 'text' }),
        request(app)
          .post(`/api/messages/conversation/${conversationId}`)
          .set('Authorization', `Bearer ${user1Token}`)
          .send({ content: 'Message 2', type: 'text' }),
      ]);

      messageIds = responses.map(r => r.body.data.id);
    });

    test('should mark messages as read', async () => {
      const response = await request(app)
        .post(`/api/messages/conversation/${conversationId}/read`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ messageIds })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify messages are marked as read
      const messages = await Message.find({ _id: { $in: messageIds } });
      messages.forEach(message => {
        expect(message.readBy.some(r => r.user.toString() === user2Id)).toBe(true);
      });
    });

    test('should reset conversation unread count', async () => {
      await request(app)
        .post(`/api/messages/conversation/${conversationId}/read`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ messageIds })
        .expect(200);

      const conversation = await Conversation.findById(conversationId);
      expect(conversation?.unreadCount.get(user2Id)).toBe(0);
    });
  });
});
