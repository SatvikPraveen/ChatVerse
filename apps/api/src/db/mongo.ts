// apps/api/src/db/mongo.ts
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export async function connectToDatabase() {
  try {
    const options: mongoose.ConnectOptions = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false,
      bufferMaxEntries: 0,
    };

    await mongoose.connect(env.MONGODB_URI, options);

    // Handle connection events
    mongoose.connection.on('connected', () => {
      logger.info('Connected to MongoDB');
    });

    mongoose.connection.on('error', (error) => {
      logger.error({ error }, 'MongoDB connection error');
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('Disconnected from MongoDB');
    });

    // Create indexes for better performance
    await createIndexes();

    logger.info('MongoDB connection established successfully');
  } catch (error) {
    logger.fatal({ error }, 'Failed to connect to MongoDB');
    throw error;
  }
}

async function createIndexes() {
  try {
    // User indexes
    await mongoose.connection.db.collection('users').createIndexes([
      { key: { email: 1 }, unique: true },
      { key: { createdAt: 1 } },
      { key: { 'presence.lastSeen': 1 } }
    ]);

    // Conversation indexes
    await mongoose.connection.db.collection('conversations').createIndexes([
      { key: { participants: 1 } },
      { key: { updatedAt: -1 } },
      { key: { type: 1 } }
    ]);

    // Message indexes
    await mongoose.connection.db.collection('messages').createIndexes([
      { key: { conversationId: 1, createdAt: -1 } },
      { key: { senderId: 1 } },
      { key: { createdAt: 1 }, expireAfterSeconds: 60 * 60 * 24 * 90 } // 90 days TTL
    ]);

    logger.info('Database indexes created successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to create database indexes');
    throw error;
  }
}
