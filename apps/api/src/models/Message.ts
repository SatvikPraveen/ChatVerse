// apps/api/src/models/Message.ts
import mongoose, { Schema, Document } from 'mongoose';
import type { Message as IMessage } from '@chatverse/types';

export interface MessageDocument extends Omit<IMessage, 'id'>, Document {
  toPublicJSON(): IMessage;
}

const attachmentSchema = new Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  size: { type: Number, required: true },
  type: { type: String, required: true },
  url: { type: String, required: true },
  thumbnailUrl: String,
  metadata: {
    width: Number,
    height: Number,
    duration: Number,
    mimeType: String
  }
}, { _id: false });

const messageSchema = new Schema<MessageDocument>({
  conversationId: {
    type: Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },
  senderId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  content: {
    type: String,
    required: function() {
      return !this.attachments || this.attachments.length === 0;
    },
    maxlength: [4000, 'Message content cannot exceed 4000 characters']
  },
  type: {
    type: String,
    enum: ['text', 'image', 'video', 'audio', 'file', 'system'],
    default: 'text'
  },
  attachments: [attachmentSchema],
  replyTo: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  reactions: [{
    emoji: {
      type: String,
      required: true
    },
    users: [{
      type: Schema.Types.ObjectId,
      ref: 'User'
    }],
    count: {
      type: Number,
      default: 0
    }
  }],
  readBy: [{
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  editHistory: [{
    content: String,
    editedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isEdited: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  metadata: {
    ipAddress: String,
    userAgent: String,
    platform: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save middleware
messageSchema.pre('save', function(next) {
  // Set message type based on attachments
  if (this.attachments && this.attachments.length > 0) {
    const firstAttachment = this.attachments[0];
    if (firstAttachment.type.startsWith('image/')) {
      this.type = 'image';
    } else if (firstAttachment.type.startsWith('video/')) {
      this.type = 'video';
    } else if (firstAttachment.type.startsWith('audio/')) {
      this.type = 'audio';
    } else {
      this.type = 'file';
    }
  }

  next();
});

// Instance method to add reaction
messageSchema.methods.addReaction = function(emoji: string, userId: string) {
  const existingReaction = this.reactions.find((r: any) => r.emoji === emoji);

  if (existingReaction) {
    if (!existingReaction.users.includes(userId)) {
      existingReaction.users.push(userId);
      existingReaction.count = existingReaction.users.length;
    }
  } else {
    this.reactions.push({
      emoji,
      users: [userId],
      count: 1
    });
  }
};

// Instance method to remove reaction
messageSchema.methods.removeReaction = function(emoji: string, userId: string) {
  const reaction = this.reactions.find((r: any) => r.emoji === emoji);

  if (reaction) {
    reaction.users = reaction.users.filter((id: any) => id.toString() !== userId);
    reaction.count = reaction.users.length;

    if (reaction.count === 0) {
      this.reactions = this.reactions.filter((r: any) => r.emoji !== emoji);
    }
  }
};

// Instance method to mark as read by user
messageSchema.methods.markAsRead = function(userId: string) {
  const existingRead = this.readBy.find((r: any) => r.user.toString() === userId);

  if (!existingRead) {
    this.readBy.push({
      user: userId,
      readAt: new Date()
    });
  }
};

// Instance method to check if read by user
messageSchema.methods.isReadBy = function(userId: string): boolean {
  return this.readBy.some((r: any) => r.user.toString() === userId);
};

// Instance method to edit message
messageSchema.methods.edit = function(newContent: string) {
  if (this.content !== newContent) {
    this.editHistory.push({
      content: this.content,
      editedAt: new Date()
    });

    this.content = newContent;
    this.isEdited = true;
  }
};

// Instance method to soft delete message
messageSchema.methods.softDelete = function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.content = 'This message has been deleted';
  this.attachments = [];
};

// Instance method to return public message data
messageSchema.methods.toPublicJSON = function() {
  const message = this.toObject();
  delete message.__v;
  delete message.metadata;

  return {
    ...message,
    id: message._id.toString()
  };
};

// Virtual for id
messageSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

// Indexes
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1 });
messageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // 90 days TTL
messageSchema.index({ type: 1 });
messageSchema.index({ isDeleted: 1 });

export const Message = mongoose.model<MessageDocument>('Message', messageSchema);
