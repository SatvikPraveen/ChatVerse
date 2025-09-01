// apps/api/src/tests/setup.ts
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createClient } from 'redis-mock';
import { beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';

let mongoServer: MongoMemoryServer;
let redisClient: any;

// Global test setup
beforeAll(async () => {
  // Start in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  await mongoose.connect(mongoUri);

  // Mock Redis
  redisClient = createClient();

  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-key-minimum-32-characters';
});

// Cleanup after all tests
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  if (redisClient) {
    redisClient.quit();
  }
});

// Clean database before each test
beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// Additional cleanup after each test
afterEach(async () => {
  // Clear any pending timers or operations
  jest.clearAllTimers();
  jest.clearAllMocks();
});

// Test utilities
export const testUtils = {
  // Create test user
  createTestUser: () => ({
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123'
  }),

  // Create test conversation
  createTestConversation: (participants: string[]) => ({
    type: 'group',
    name: 'Test Conversation',
    participants
  }),

  // Create test message
  createTestMessage: (conversationId: string, senderId: string) => ({
    conversationId,
    senderId,
    content: 'Test message content',
    type: 'text'
  }),

  // Wait for async operations
  sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  // Generate random string
  randomString: (length: number = 10) =>
    Math.random().toString(36).substring(2, length + 2)
};
