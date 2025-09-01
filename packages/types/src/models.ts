// File: packages/types/src/models.ts

export interface User {
  _id: string;
  username: string;
  email: string;
  displayName: string;
  avatar?: string;
  status: 'online' | 'offline' | 'away' | 'busy';
  lastSeen: Date;
  isVerified: boolean;
  preferences: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  notifications: {
    desktop: boolean;
    sound: boolean;
    mentions: boolean;
    directMessages: boolean;
  };
  privacy: {
    showOnlineStatus: boolean;
    showLastSeen: boolean;
    allowDirectMessages: boolean;
  };
}

export interface Conversation {
  _id: string;
  type: 'direct' | 'group';
  name?: string;
  description?: string;
  avatar?: string;
  participants: string[];
  admins: string[];
  lastMessage?: Message;
  unreadCount: number;
  isArchived: boolean;
  isPinned: boolean;
  settings: ConversationSettings;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface ConversationSettings {
  isEncrypted: boolean;
  muteNotifications: boolean;
  muteUntil?: Date;
  allowInvites: boolean;
  disappearingMessages?: {
    enabled: boolean;
    duration: number; // in seconds
  };
}

export interface Message {
  _id: string;
  conversationId: string;
  senderId: string;
  type: 'text' | 'image' | 'file' | 'video' | 'audio' | 'system';
  content: string;
  metadata?: MessageMetadata;
  attachments?: Attachment[];
  replyTo?: string;
  reactions: Reaction[];
  isEdited: boolean;
  editedAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  readBy: ReadReceipt[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageMetadata {
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  duration?: number; // for audio/video
  dimensions?: {
    width: number;
    height: number;
  };
  thumbnail?: string;
}

export interface Attachment {
  _id: string;
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  thumbnail?: string;
}

export interface Reaction {
  emoji: string;
  userId: string;
  createdAt: Date;
}

export interface ReadReceipt {
  userId: string;
  readAt: Date;
}

export interface TypingStatus {
  userId: string;
  conversationId: string;
  isTyping: boolean;
  timestamp: Date;
}

export interface OnlineStatus {
  userId: string;
  status: 'online' | 'offline' | 'away' | 'busy';
  lastSeen: Date;
}

export interface PushSubscription {
  _id: string;
  userId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  createdAt: Date;
}

export interface Notification {
  _id: string;
  userId: string;
  type: 'message' | 'mention' | 'invite' | 'system';
  title: string;
  body: string;
  data?: any;
  isRead: boolean;
  createdAt: Date;
}

// Utility types
export type UserWithoutPassword = Omit<User, 'password'>;
export type MessageWithSender = Message & { sender: UserWithoutPassword };
export type ConversationWithParticipants = Conversation & {
  participantDetails: UserWithoutPassword[]
};

// Enums
export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
  VIDEO = 'video',
  AUDIO = 'audio',
  SYSTEM = 'system'
}

export enum ConversationType {
  DIRECT = 'direct',
  GROUP = 'group'
}

export enum UserStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  AWAY = 'away',
  BUSY = 'busy'
}
