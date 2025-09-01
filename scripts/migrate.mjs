#!/usr/bin/env node
// File: scripts/migrate.mjs

import { MongoClient } from 'mongodb';
import { config } from 'dotenv';

// Load environment variables
config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://chatverse:chatverse123@localhost:27017/chatverse?authSource=admin';

async function runMigrations() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('📊 Connected to MongoDB');

    const db = client.db('chatverse');

    console.log('🔧 Creating database indexes...');

    // Users collection indexes
    await db.collection('users').createIndexes([
      { key: { email: 1 }, unique: true, name: 'email_unique' },
      { key: { username: 1 }, unique: true, name: 'username_unique' },
      { key: { status: 1 }, name: 'status_index' },
      { key: { lastSeen: 1 }, name: 'lastSeen_index' },
      { key: { createdAt: 1 }, name: 'createdAt_index' }
    ]);
    console.log('✅ Users indexes created');

    // Conversations collection indexes
    await db.collection('conversations').createIndexes([
      { key: { participants: 1 }, name: 'participants_index' },
      { key: { type: 1 }, name: 'type_index' },
      { key: { updatedAt: -1 }, name: 'updatedAt_desc' },
      { key: { createdBy: 1 }, name: 'createdBy_index' },
      { key: { isArchived: 1 }, name: 'isArchived_index' },
      { key: { isPinned: 1 }, name: 'isPinned_index' },
      // Compound index for user's conversations sorted by last activity
      { key: { participants: 1, updatedAt: -1 }, name: 'user_conversations' }
    ]);
    console.log('✅ Conversations indexes created');

    // Messages collection indexes
    await db.collection('messages').createIndexes([
      { key: { conversationId: 1, createdAt: -1 }, name: 'conversation_messages' },
      { key: { senderId: 1 }, name: 'senderId_index' },
      { key: { type: 1 }, name: 'type_index' },
      { key: { createdAt: -1 }, name: 'createdAt_desc' },
      { key: { isDeleted: 1 }, name: 'isDeleted_index' },
      { key: { replyTo: 1 }, name: 'replyTo_index' },
      // Text search index for message content
      { key: { content: 'text' }, name: 'content_text_search' },
      // Compound index for efficient message queries
      { key: { conversationId: 1, isDeleted: 1, createdAt: -1 }, name: 'conversation_active_messages' }
    ]);
    console.log('✅ Messages indexes created');

    // Push subscriptions collection indexes
    await db.collection('pushsubscriptions').createIndexes([
      { key: { userId: 1 }, name: 'userId_index' },
      { key: { endpoint: 1 }, unique: true, name: 'endpoint_unique' },
      { key: { createdAt: 1 }, expireAfterSeconds: 60 * 60 * 24 * 30, name: 'ttl_30days' } // 30 days TTL
    ]);
    console.log('✅ Push subscriptions indexes created');

    // Notifications collection indexes
    await db.collection('notifications').createIndexes([
      { key: { userId: 1, createdAt: -1 }, name: 'user_notifications' },
      { key: { isRead: 1 }, name: 'isRead_index' },
      { key: { type: 1 }, name: 'type_index' },
      { key: { createdAt: 1 }, expireAfterSeconds: 60 * 60 * 24 * 7, name: 'ttl_7days' } // 7 days TTL
    ]);
    console.log('✅ Notifications indexes created');

    // Session collection (for Redis fallback)
    await db.collection('sessions').createIndexes([
      { key: { sessionId: 1 }, unique: true, name: 'sessionId_unique' },
      { key: { userId: 1 }, name: 'userId_index' },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: 'ttl_expiresAt' }
    ]);
    console.log('✅ Sessions indexes created');

    // Rate limiting collection
    await db.collection('ratelimits').createIndexes([
      { key: { key: 1 }, unique: true, name: 'key_unique' },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: 'ttl_expiresAt' }
    ]);
    console.log('✅ Rate limits indexes created');

    console.log('🔧 Setting up TTL collections...');

    // Typing status collection (short-lived)
    await db.collection('typingstatus').createIndexes([
      { key: { userId: 1, conversationId: 1 }, unique: true, name: 'user_conversation_unique' },
      { key: { timestamp: 1 }, expireAfterSeconds: 10, name: 'ttl_10seconds' }
    ]);
    console.log('✅ Typing status TTL configured');

    // Online status collection (medium-lived)
    await db.collection('onlinestatus').createIndexes([
      { key: { userId: 1 }, unique: true, name: 'userId_unique' },
      { key: { lastSeen: 1 }, expireAfterSeconds: 60 * 60 * 24, name: 'ttl_24hours' }
    ]);
    console.log('✅ Online status TTL configured');

    console.log('🔧 Creating database views...');

    // Create a view for user conversations with participant details
    try {
      await db.createCollection('userconversationsview', {
        viewOn: 'conversations',
        pipeline: [
          {
            $lookup: {
              from: 'users',
              localField: 'participants',
              foreignField: '_id',
              as: 'participantDetails',
              pipeline: [
                {
                  $project: {
                    password: 0,
                    __v: 0
                  }
                }
              ]
            }
          },
          {
            $lookup: {
              from: 'users',
              localField: 'lastMessage.senderId',
              foreignField: '_id',
              as: 'lastMessageSender',
              pipeline: [
                {
                  $project: {
                    _id: 1,
                    displayName: 1,
                    avatar: 1
                  }
                }
              ]
            }
          },
          {
            $addFields: {
              lastMessage: {
                $cond: {
                  if: { $ne: ['$lastMessage', null] },
                  then: {
                    $mergeObjects: [
                      '$lastMessage',
                      { sender: { $arrayElemAt: ['$lastMessageSender', 0] } }
                    ]
                  },
                  else: null
                }
              }
            }
          },
          {
            $project: {
              lastMessageSender: 0
            }
          }
        ]
      });
      console.log('✅ User conversations view created');
    } catch (error) {
      if (error.code === 48) {
        console.log('✅ User conversations view already exists');
      } else {
        throw error;
      }
    }

    console.log('🔧 Setting up database constraints...');

    // Validate conversation participants (at least 2 for direct, at least 1 for group)
    await db.runCommand({
      collMod: 'conversations',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['type', 'participants', 'createdBy'],
          properties: {
            type: {
              enum: ['direct', 'group']
            },
            participants: {
              bsonType: 'array',
              minItems: 1,
              items: {
                bsonType: 'string'
              }
            },
            name: {
              bsonType: 'string',
              maxLength: 100
            },
            description: {
              bsonType: 'string',
              maxLength: 500
            }
          },
          additionalProperties: true
        }
      },
      validationAction: 'error'
    });
    console.log('✅ Conversation validation rules applied');

    // Validate message content length
    await db.runCommand({
      collMod: 'messages',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['conversationId', 'senderId', 'type', 'content'],
          properties: {
            type: {
              enum: ['text', 'image', 'file', 'video', 'audio', 'system']
            },
            content: {
              bsonType: 'string',
              maxLength: 10000
            }
          },
          additionalProperties: true
        }
      },
      validationAction: 'error'
    });
    console.log('✅ Message validation rules applied');

    console.log('\n🎉 All migrations completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run migrations
runMigrations().catch(console.error);
