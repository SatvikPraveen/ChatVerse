// apps/api/src/models/Conversation.ts
import mongoose, { Schema, Document } from 'mongoose';
import type { Conversation as IConversation } from '@chatverse/types';

export interface ConversationDocument extends Omit<IConversation, 'id'>, Document {
  toPublicJSON(): IConversation;
}

const conversationSchema = new Schema<ConversationDocument>({
  type: {
    type: String,
    enum: ['direct', 'group'],
    required: true,
    default: 'direct'
  },
  name: {
    type: String,
    trim: true,
    maxlength: [100, 'Conversation name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  avatar: {
    type: String,
    default: null
  },
  participants: [{
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    lastReadMessageId: {
      type: Schema.Types.ObjectId,
      ref: 'Message'
    },
    lastReadAt: {
      type: Date,
      default: Date.now
    }
  }],
  settings: {
    isPublic: {
      type: Boolean,
      default: false
    },
    allowInvites: {
      type: Boolean,
      default: true
    },
    maxParticipants: {
      type: Number,
      default: 100,
      max: [1000, 'Maximum participants cannot exceed 1000']
    }
  },
  lastMessage: {
    content: String,
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: Date,
    type: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'file'],
      default: 'text'
    }
  },
  unreadCount: {
    type: Map,
    of: Number,
    default: new Map()
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save middleware for direct conversations
conversationSchema.pre('save', function(next) {
  if (this.type === 'direct') {
    // Direct conversations don't need names or descriptions
    this.name = undefined;
    this.description = undefined;

    // Ensure only 2 participants for direct conversations
    if (this.participants.length !== 2) {
      return next(new Error('Direct conversations must have exactly 2 participants'));
    }
  } else if (this.type === 'group' && !this.name) {
    return next(new Error('Group conversations must have a name'));
  }

  next();
});

// Instance method to check if user is participant
conversationSchema.methods.hasParticipant = function(userId: string): boolean {
  return this.participants.some((p: any) => p.user.toString() === userId);
};

// Instance method to get participant by user ID
conversationSchema.methods.getParticipant = function(userId: string) {
  return this.participants.find((p: any) => p.user.toString() === userId);
};

// Instance method to add participant
conversationSchema.methods.addParticipant = function(userId: string, role: string = 'member') {
  if (this.hasParticipant(userId)) {
    throw new Error('User is already a participant');
  }

  this.participants.push({
    user: userId,
    role,
    joinedAt: new Date()
  });
};

// Instance method to remove participant
conversationSchema.methods.removeParticipant = function(userId: string) {
  this.participants = this.participants.filter((p: any) => p.user.toString() !== userId);
};

// Instance method to update unread count
conversationSchema.methods.updateUnreadCount = function(userId: string, count: number) {
  this.unreadCount.set(userId, Math.max(0, count));
};

// Instance method to increment unread count
conversationSchema.methods.incrementUnreadCount = function(userId: string) {
  const current = this.unreadCount.get(userId) || 0;
  this.unreadCount.set(userId, current + 1);
};

// Instance method to reset unread count
conversationSchema.methods.resetUnreadCount = function(userId: string) {
  this.unreadCount.set(userId, 0);
};

// Instance method to return public conversation data
conversationSchema.methods.toPublicJSON = function() {
  const conversation = this.toObject();
  delete conversation.__v;

  return {
    ...conversation,
    id: conversation._id.toString(),
    unreadCount: Object.fromEntries(conversation.unreadCount || new Map())
  };
};

// Virtual for id
conversationSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

// Indexes
conversationSchema.index({ participants: 1 });
conversationSchema.index({ updatedAt: -1 });
conversationSchema.index({ type: 1 });
conversationSchema.index({ 'participants.user': 1, updatedAt: -1 });

export const Conversation = mongoose.model<ConversationDocument>('Conversation', conversationSchema);
