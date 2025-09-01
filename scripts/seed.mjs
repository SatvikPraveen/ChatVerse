#!/usr/bin/env node
// File: scripts/seed.mjs

import { MongoClient, ObjectId } from 'mongodb';
import bcrypt from 'bcrypt';
import { config } from 'dotenv';

// Load environment variables
config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://chatverse:chatverse123@localhost:27017/chatverse?authSource=admin';

async function seedDatabase() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('📊 Connected to MongoDB');

    const db = client.db('chatverse');

    // Clear existing data
    console.log('🧹 Clearing existing data...');
    await Promise.all([
      db.collection('users').deleteMany({}),
      db.collection('conversations').deleteMany({}),
      db.collection('messages').deleteMany({})
    ]);

    // Create demo users
    console.log('👥 Creating demo users...');
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash('password123', saltRounds);

    const users = [
      {
        _id: new ObjectId(),
        username: 'alice_wonder',
        email: 'alice@example.com',
        displayName: 'Alice Wonder',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice',
        status: 'online',
        lastSeen: new Date(),
        isVerified: true,
        password: hashedPassword,
        preferences: {
          theme: 'light',
          notifications: {
            desktop: true,
            sound: true,
            mentions: true,
            directMessages: true
          },
          privacy: {
            showOnlineStatus: true,
            showLastSeen: true,
            allowDirectMessages: true
          }
        },
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        _id: new ObjectId(),
        username: 'bob_builder',
        email: 'bob@example.com',
        displayName: 'Bob the Builder',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bob',
        status: 'online',
        lastSeen: new Date(),
        isVerified: true,
        password: hashedPassword,
        preferences: {
          theme: 'dark',
          notifications: {
            desktop: true,
            sound: false,
            mentions: true,
            directMessages: true
          },
          privacy: {
            showOnlineStatus: true,
            showLastSeen: false,
            allowDirectMessages: true
          }
        },
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        _id: new ObjectId(),
        username: 'charlie_dev',
        email: 'charlie@example.com',
        displayName: 'Charlie Developer',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie',
        status: 'away',
        lastSeen: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        isVerified: false,
        password: hashedPassword,
        preferences: {
          theme: 'dark',
          notifications: {
            desktop: false,
            sound: true,
            mentions: true,
            directMessages: false
          },
          privacy: {
            showOnlineStatus: false,
            showLastSeen: true,
            allowDirectMessages: true
          }
        },
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    await db.collection('users').insertMany(users);
    console.log(`✅ Created ${users.length} demo users`);

    // Create demo conversations
    console.log('💬 Creating demo conversations...');
    const conversations = [
      {
        _id: new ObjectId(),
        type: 'direct',
        participants: [users[0]._id.toString(), users[1]._id.toString()],
        admins: [],
        unreadCount: 0,
        isArchived: false,
        isPinned: true,
        settings: {
          isEncrypted: false,
          muteNotifications: false,
          allowInvites: false
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: users[0]._id.toString()
      },
      {
        _id: new ObjectId(),
        type: 'group',
        name: 'Development Team',
        description: 'Main development discussion',
        participants: users.map(u => u._id.toString()),
        admins: [users[0]._id.toString()],
        unreadCount: 0,
        isArchived: false,
        isPinned: false,
        settings: {
          isEncrypted: false,
          muteNotifications: false,
          allowInvites: true
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: users[0]._id.toString()
      },
      {
        _id: new ObjectId(),
        type: 'direct',
        participants: [users[0]._id.toString(), users[2]._id.toString()],
        admins: [],
        unreadCount: 2,
        isArchived: false,
        isPinned: false,
        settings: {
          isEncrypted: true,
          muteNotifications: false,
          allowInvites: false
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: users[2]._id.toString()
      }
    ];

    await db.collection('conversations').insertMany(conversations);
    console.log(`✅ Created ${conversations.length} demo conversations`);

    // Create demo messages
    console.log('📝 Creating demo messages...');
    const messages = [
      // Messages for Alice-Bob conversation
      {
        _id: new ObjectId(),
        conversationId: conversations[0]._id.toString(),
        senderId: users[0]._id.toString(),
        type: 'text',
        content: 'Hey Bob! How\'s the project coming along?',
        attachments: [],
        reactions: [],
        isEdited: false,
        isDeleted: false,
        readBy: [
          { userId: users[0]._id.toString(), readAt: new Date() },
          { userId: users[1]._id.toString(), readAt: new Date() }
        ],
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
      },
      {
        _id: new ObjectId(),
        conversationId: conversations[0]._id.toString(),
        senderId: users[1]._id.toString(),
        type: 'text',
        content: 'Going great! Just finished the authentication system. 🚀',
        attachments: [],
        reactions: [
          { emoji: '👍', userId: users[0]._id.toString(), createdAt: new Date() }
        ],
        isEdited: false,
        isDeleted: false,
        readBy: [
          { userId: users[0]._id.toString(), readAt: new Date() },
          { userId: users[1]._id.toString(), readAt: new Date() }
        ],
        createdAt: new Date(Date.now() - 1.5 * 60 * 60 * 1000), // 1.5 hours ago
        updatedAt: new Date(Date.now() - 1.5 * 60 * 60 * 1000)
      },

      // Messages for group conversation
      {
        _id: new ObjectId(),
        conversationId: conversations[1]._id.toString(),
        senderId: users[0]._id.toString(),
        type: 'text',
        content: 'Welcome to the development team chat! Let\'s use this for daily updates and quick questions.',
        attachments: [],
        reactions: [
          { emoji: '👋', userId: users[1]._id.toString(), createdAt: new Date() },
          { emoji: '🎉', userId: users[2]._id.toString(), createdAt: new Date() }
        ],
        isEdited: false,
        isDeleted: false,
        readBy: users.map(u => ({ userId: u._id.toString(), readAt: new Date() })),
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
      },
      {
        _id: new ObjectId(),
        conversationId: conversations[1]._id.toString(),
        senderId: users[2]._id.toString(),
        type: 'text',
        content: 'Sounds good! I\'m working on the real-time messaging features today.',
        attachments: [],
        reactions: [],
        isEdited: false,
        isDeleted: false,
        readBy: [
          { userId: users[0]._id.toString(), readAt: new Date() },
          { userId: users[2]._id.toString(), readAt: new Date() }
        ],
        createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
        updatedAt: new Date(Date.now() - 12 * 60 * 60 * 1000)
      },

      // Messages for Alice-Charlie conversation
      {
        _id: new ObjectId(),
        conversationId: conversations[2]._id.toString(),
        senderId: users[2]._id.toString(),
        type: 'text',
        content: 'Hey Alice, can we discuss the architecture for the file upload feature?',
        attachments: [],
        reactions: [],
        isEdited: false,
        isDeleted: false,
        readBy: [
          { userId: users[2]._id.toString(), readAt: new Date() }
        ],
        createdAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        updatedAt: new Date(Date.now() - 30 * 60 * 1000)
      },
      {
        _id: new ObjectId(),
        conversationId: conversations[2]._id.toString(),
        senderId: users[2]._id.toString(),
        type: 'text',
        content: 'I\'m thinking we should use presigned URLs with S3 for better security.',
        attachments: [],
        reactions: [],
        isEdited: false,
        isDeleted: false,
        readBy: [
          { userId: users[2]._id.toString(), readAt: new Date() }
        ],
        createdAt: new Date(Date.now() - 25 * 60 * 1000), // 25 minutes ago
        updatedAt: new Date(Date.now() - 25 * 60 * 1000)
      }
    ];

    await db.collection('messages').insertMany(messages);
    console.log(`✅ Created ${messages.length} demo messages`);

    // Update conversations with last messages
    console.log('🔄 Updating conversation metadata...');
    for (const conversation of conversations) {
      const lastMessage = messages
        .filter(m => m.conversationId === conversation._id.toString())
        .sort((a, b) => b.createdAt - a.createdAt)[0];

      if (lastMessage) {
        await db.collection('conversations').updateOne(
          { _id: conversation._id },
          {
            $set: {
              lastMessage: {
                _id: lastMessage._id,
                content: lastMessage.content,
                type: lastMessage.type,
                senderId: lastMessage.senderId,
                createdAt: lastMessage.createdAt
              },
              updatedAt: lastMessage.createdAt
            }
          }
        );
      }
    }

    console.log('✅ Updated conversation metadata');

    console.log('\n🎉 Database seeded successfully!');
    console.log('\n📋 Demo Accounts:');
    console.log('  - alice@example.com / password123');
    console.log('  - bob@example.com / password123');
    console.log('  - charlie@example.com / password123');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the seeding
seedDatabase().catch(console.error);
