// File: packages/types/src/socket.ts

import { Message, User, Conversation, TypingStatus, OnlineStatus } from './models';

// Client to Server Events
export interface ClientToServerEvents {
  // Connection & Auth
  authenticate: (token: string, callback: (response: AuthSocketResponse) => void) => void;

  // Conversation Events
  join_conversation: (conversationId: string) => void;
  leave_conversation: (conversationId: string) => void;

  // Message Events
  send_message: (data: SendMessageSocketData, callback: (response: MessageSocketResponse) => void) => void;
  edit_message: (data: EditMessageSocketData) => void;
  delete_message: (data: DeleteMessageSocketData) => void;
  add_reaction: (data: ReactionSocketData) => void;
  remove_reaction: (data: ReactionSocketData) => void;
  mark_as_read: (data: MarkAsReadSocketData) => void;

  // Typing Events
  start_typing: (conversationId: string) => void;
  stop_typing: (conversationId: string) => void;

  // Presence Events
  update_status: (status: 'online' | 'away' | 'busy') => void;

  // Connection Events
  ping: (callback: (timestamp: number) => void) => void;
}

// Server to Client Events
export interface ServerToClientEvents {
  // Connection & Auth
  authenticated: (data: AuthenticatedSocketData) => void;
  authentication_error: (error: string) => void;

  // Message Events
  new_message: (data: NewMessageSocketData) => void;
  message_updated: (data: MessageUpdatedSocketData) => void;
  message_deleted: (data: MessageDeletedSocketData) => void;
  reaction_added: (data: ReactionSocketData) => void;
  reaction_removed: (data: ReactionSocketData) => void;
  message_read: (data: MessageReadSocketData) => void;

  // Conversation Events
  conversation_updated: (data: ConversationUpdatedSocketData) => void;
  user_joined_conversation: (data: UserJoinedSocketData) => void;
  user_left_conversation: (data: UserLeftSocketData) => void;

  // Typing Events
  user_typing: (data: TypingSocketData) => void;
  user_stopped_typing: (data: TypingSocketData) => void;

  // Presence Events
  user_online: (data: UserOnlineSocketData) => void;
  user_offline: (data: UserOfflineSocketData) => void;
  user_status_changed: (data: UserStatusSocketData) => void;

  // Error Events
  error: (error: SocketError) => void;
  rate_limit_exceeded: (data: RateLimitSocketData) => void;

  // Connection Events
  pong: (timestamp: number) => void;
  disconnect_reason: (reason: string) => void;
}

// Socket Data Types
export interface AuthSocketResponse {
  success: boolean;
  user?: Omit<User, 'password'>;
  error?: string;
}

export interface AuthenticatedSocketData {
  user: Omit<User, 'password'>;
  onlineUsers: string[];
}

export interface SendMessageSocketData {
  conversationId: string;
  type: 'text' | 'image' | 'file' | 'video' | 'audio';
  content: string;
  attachments?: string[];
  replyTo?: string;
  tempId?: string; // client-generated temp ID
}

export interface MessageSocketResponse {
  success: boolean;
  message?: Message;
  tempId?: string;
  error?: string;
}

export interface NewMessageSocketData {
  message: Message & { sender: Omit<User, 'password'> };
  conversationId: string;
}

export interface EditMessageSocketData {
  messageId: string;
  content: string;
}

export interface MessageUpdatedSocketData {
  messageId: string;
  content: string;
  editedAt: Date;
  conversationId: string;
}

export interface DeleteMessageSocketData {
  messageId: string;
  deleteForEveryone?: boolean;
}

export interface MessageDeletedSocketData {
  messageId: string;
  conversationId: string;
  deletedBy: string;
  deletedAt: Date;
  deleteForEveryone: boolean;
}

export interface ReactionSocketData {
  messageId: string;
  emoji: string;
  userId?: string; // populated by server
  conversationId: string;
}

export interface MarkAsReadSocketData {
  conversationId: string;
  messageId: string;
}

export interface MessageReadSocketData {
  conversationId: string;
  messageId: string;
  userId: string;
  readAt: Date;
}

export interface TypingSocketData {
  conversationId: string;
  userId: string;
  displayName: string;
}

export interface UserOnlineSocketData {
  userId: string;
  status: 'online' | 'away' | 'busy';
  lastSeen: Date;
}

export interface UserOfflineSocketData {
  userId: string;
  lastSeen: Date;
}

export interface UserStatusSocketData {
  userId: string;
  status: 'online' | 'offline' | 'away' | 'busy';
  lastSeen: Date;
}

export interface ConversationUpdatedSocketData {
  conversation: Conversation;
}

export interface UserJoinedSocketData {
  conversationId: string;
  user: Omit<User, 'password'>;
  joinedBy: string;
}

export interface UserLeftSocketData {
  conversationId: string;
  userId: string;
  leftAt: Date;
}

export interface SocketError {
  code: string;
  message: string;
  details?: any;
}

export interface RateLimitSocketData {
  limit: number;
  windowMs: number;
  remaining: number;
  resetTime: Date;
}

// Socket Middleware Data
export interface SocketAuthData {
  userId: string;
  user: Omit<User, 'password'>;
}

// Room naming conventions
export const SOCKET_ROOMS = {
  USER: (userId: string) => `user:${userId}`,
  CONVERSATION: (conversationId: string) => `conversation:${conversationId}`,
  GLOBAL: 'global',
} as const;

// Event naming conventions
export const SOCKET_EVENTS = {
  // Connection
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  AUTHENTICATE: 'authenticate',
  AUTHENTICATED: 'authenticated',
  AUTHENTICATION_ERROR: 'authentication_error',

  // Messages
  SEND_MESSAGE: 'send_message',
  NEW_MESSAGE: 'new_message',
  EDIT_MESSAGE: 'edit_message',
  MESSAGE_UPDATED: 'message_updated',
  DELETE_MESSAGE: 'delete_message',
  MESSAGE_DELETED: 'message_deleted',

  // Reactions
  ADD_REACTION: 'add_reaction',
  REMOVE_REACTION: 'remove_reaction',
  REACTION_ADDED: 'reaction_added',
  REACTION_REMOVED: 'reaction_removed',

  // Read receipts
  MARK_AS_READ: 'mark_as_read',
  MESSAGE_READ: 'message_read',

  // Typing
  START_TYPING: 'start_typing',
  STOP_TYPING: 'stop_typing',
  USER_TYPING: 'user_typing',
  USER_STOPPED_TYPING: 'user_stopped_typing',

  // Presence
  UPDATE_STATUS: 'update_status',
  USER_ONLINE: 'user_online',
  USER_OFFLINE: 'user_offline',
  USER_STATUS_CHANGED: 'user_status_changed',

  // Conversations
  JOIN_CONVERSATION: 'join_conversation',
  LEAVE_CONVERSATION: 'leave_conversation',
  CONVERSATION_UPDATED: 'conversation_updated',
  USER_JOINED_CONVERSATION: 'user_joined_conversation',
  USER_LEFT_CONVERSATION: 'user_left_conversation',

  // Errors
  ERROR: 'error',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',

  // Ping/Pong
  PING: 'ping',
  PONG: 'pong',
} as const;

// Rate limiting types
export interface SocketRateLimit {
  points: number;
  duration: number;
  blockDuration?: number;
}

export const SOCKET_RATE_LIMITS = {
  MESSAGE: { points: 30, duration: 60 }, // 30 messages per minute
  TYPING: { points: 10, duration: 10 }, // 10 typing events per 10 seconds
  REACTION: { points: 50, duration: 60 }, // 50 reactions per minute
  STATUS: { points: 5, duration: 60 }, // 5 status updates per minute
} as const;
