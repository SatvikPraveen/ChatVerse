// apps/api/src/tests/e2e/chat-flow.e2e.test.ts
import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as Client } from 'socket.io-client';
import { createApp } from '../../server.js';
import { createSocketServer } from '../../realtime/io.js';
import { User } from '../../models/User.js';
import { Conversation } from '../../models/Conversation.js';
import { Message } from '../../models/Message.js';
import '../setup.js';

describe('End-to-End Chat Flow', () => {
  let httpServer: any;
  let app: any;
  let port: number;
  let user1Token: string, user2Token: string;
  let user1Id: string, user2Id: string;
  let clientSocket1: any, clientSocket2: any;

  beforeAll(async () => {
    app = createApp();
    httpServer = createServer(app);
    createSocketServer(httpServer);

    // Start server on random port
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        port = httpServer.address().port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (clientSocket1) clientSocket1.disconnect();
    if (clientSocket2) clientSocket2.disconnect();
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  });

  beforeEach(async () => {
    // Clean up
    await Promise.all([
      User.deleteMany({}),
      Conversation.deleteMany({}),
      Message.deleteMany({})
    ]);

    if (clientSocket1) clientSocket1.disconnect();
    if (clientSocket2) clientSocket2.disconnect();
  });

  describe('Complete Chat Workflow', () => {
    test('should handle complete user registration to real-time messaging flow', async () => {
      // 1. Register two users
      const user1Response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Alice',
          email: 'alice@example.com',
          password: 'password123'
        })
        .expect(201);

      const user2Response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Bob',
          email: 'bob@example.com',
          password: 'password123'
        })
        .expect(201);

      user1Token = user1Response.body.data.token;
      user2Token = user2Response.body.data.token;
      user1Id = user1Response.body.data.user.id;
      user2Id = user2Response.body.data.user.id;

      expect(user1Response.body.success).toBe(true);
      expect(user2Response.body.success).toBe(true);

      // 2. Create a conversation between users
      const conversationResponse = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          type: 'direct',
          participants: [user2Id]
        })
        .expect(201);

      const conversationId = conversationResponse.body.data.id;
      expect(conversationResponse.body.data.type).toBe('direct');
      expect(conversationResponse.body.data.participants).toHaveLength(2);

      // 3. Connect users via Socket.io
      clientSocket1 = Client(`http://localhost:${port}`, {
        auth: { token: user1Token }
      });

      clientSocket2 = Client(`http://localhost:${port}`, {
        auth: { token: user2Token }
      });

      // Wait for socket connections
      await Promise.all([
        new Promise<void>((resolve) => {
          clientSocket1.on('auth:authenticated', () => resolve());
        }),
        new Promise<void>((resolve) => {
          clientSocket2.on('auth:authenticated', () => resolve());
        })
      ]);

      // 4. Join conversation rooms
      clientSocket1.emit('conversation:join', { conversationId });
      clientSocket2.emit('conversation:join', { conversationId });

      // 5. Test real-time messaging
      const messageContent = 'Hello from Alice!';

      // Set up message listener for user2
      const messagePromise = new Promise<any>((resolve) => {
        clientSocket2.on('message:new', (data) => {
          resolve(data);
        });
      });

      // User1 sends message via Socket.io
      clientSocket1.emit('message:send', {
        conversationId,
        content: messageContent,
        type: 'text'
      });

      // Wait for real-time message delivery
      const receivedMessage = await messagePromise;
      expect(receivedMessage.message.content).toBe(messageContent);
      expect(receivedMessage.conversationId).toBe(conversationId);

      // 6. Verify message persistence in database
      const messages = await request(app)
        .get(`/api/messages/conversation/${conversationId}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(200);

      expect(messages.body.data).toHaveLength(1);
      expect(messages.body.data[0].content).toBe(messageContent);

      // 7. Test typing indicators
      const typingPromise = new Promise<any>((resolve) => {
        clientSocket2.on('typing:start', (data) => {
          resolve(data);
        });
      });

      clientSocket1.emit('typing:start', { conversationId });

      const typingData = await typingPromise;
      expect(typingData.conversationId).toBe(conversationId);
      expect(typingData.userId).toBe(user1Id);

      // 8. Test message reactions
      const reactionPromise = new Promise<any>((resolve) => {
        clientSocket1.on('message:updated', (data) => {
          resolve(data);
        });
      });

      // Add reaction via REST API
      await request(app)
        .post(`/api/messages/${receivedMessage.message.id}/reactions`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ emoji: '👍' })
        .expect(200);

      // Real-time update should be received
      const reactionUpdate = await reactionPromise;
      expect(reactionUpdate.message.reactions).toHaveLength(1);
      expect(reactionUpdate.message.reactions[0].emoji).toBe('👍');

      // 9. Test message read receipts
      await request(app)
        .post(`/api/messages/conversation/${conversationId}/read`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ messageIds: [receivedMessage.message.id] })
        .expect(200);

      // Verify read status
      const updatedMessage = await request(app)
        .get(`/api/messages/${receivedMessage.message.id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(updatedMessage.body.data.readBy).toHaveLength(1);
      expect(updatedMessage.body.data.readBy[0].user).toBe(user2Id);

      // 10. Test user presence
      const presencePromise = new Promise<any>((resolve) => {
        clientSocket2.on('presence:update', (data) => {
          resolve(data);
        });
      });

      clientSocket1.emit('presence:update', { status: 'away' });

      const presenceUpdate = await presencePromise;
      expect(presenceUpdate.userId).toBe(user1Id);
      expect(presenceUpdate.status).toBe('away');

      // 11. Verify conversation stats
      const stats = await request(app)
        .get(`/api/messages/conversation/${conversationId}/stats`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(stats.body.data.totalMessages).toBe(1);
      expect(stats.body.data.messagesByUser['Alice']).toBe(1);
    }, 30000); // Increased timeout for complex E2E test

    test('should handle user disconnection and reconnection', async () => {
      // Register and connect user
      const userResponse = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Charlie',
          email: 'charlie@example.com',
          password: 'password123'
        });

      const token = userResponse.body.data.token;
      const userId = userResponse.body.data.user.id;

      // Connect via Socket.io
      clientSocket1 = Client(`http://localhost:${port}`, {
        auth: { token }
      });

      await new Promise<void>((resolve) => {
        clientSocket1.on('auth:authenticated', () => resolve());
      });

      // Disconnect
      clientSocket1.disconnect();

      // Verify user presence updated to offline
      await new Promise(resolve => setTimeout(resolve, 100));

      const user = await User.findById(userId);
      expect(user?.presence.status).toBe('offline');

      // Reconnect
      clientSocket1 = Client(`http://localhost:${port}`, {
        auth: { token }
      });

      await new Promise<void>((resolve) => {
        clientSocket1.on('auth:authenticated', () => resolve());
      });

      // Verify user is back online
      const reconnectedUser = await User.findById(userId);
      expect(reconnectedUser?.presence.status).toBe('online');
    }, 10000);

    test('should handle message delivery failure gracefully', async () => {
      // Register user
      const userResponse = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Dave',
          email: 'dave@example.com',
          password: 'password123'
        });

      const token = userResponse.body.data.token;

      // Try to send message to non-existent conversation
      const response = await request(app)
        .post('/api/messages/conversation/507f1f77bcf86cd799439011') // Non-existent ID
        .set('Authorization', `Bearer ${token}`)
        .send({
          content: 'This should fail',
          type: 'text'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CONVERSATION_NOT_FOUND');
    });
  });

  describe('Performance and Load Tests', () => {
    test('should handle multiple concurrent messages', async () => {
      // Register users and create conversation
      const user1Response = await request(app)
        .post('/api/auth/register')
        .send({ name: 'User1', email: 'user1@example.com', password: 'password123' });

      const user2Response = await request(app)
        .post('/api/auth/register')
        .send({ name: 'User2', email: 'user2@example.com', password: 'password123' });

      const conversationResponse = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${user1Response.body.data.token}`)
        .send({
          type: 'direct',
          participants: [user2Response.body.data.user.id]
        });

      const conversationId = conversationResponse.body.data.id;

      // Send multiple messages concurrently
      const messagePromises = Array.from({ length: 10 }, (_, i) =>
        request(app)
          .post(`/api/messages/conversation/${conversationId}`)
          .set('Authorization', `Bearer ${user1Response.body.data.token}`)
          .send({
            content: `Concurrent message ${i + 1}`,
            type: 'text'
          })
      );

      const responses = await Promise.all(messagePromises);

      // All messages should be sent successfully
      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      });

      // Verify all messages are in database
      const messages = await request(app)
        .get(`/api/messages/conversation/${conversationId}`)
        .set('Authorization', `Bearer ${user1Response.body.data.token}`);

      expect(messages.body.data).toHaveLength(10);
    }, 15000);
  });
});
