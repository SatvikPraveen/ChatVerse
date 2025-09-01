// File: packages/types/src/api.ts

import { User, Conversation, Message, UserPreferences, PushSubscription } from './models';

// Base API Response
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Auth API Types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  displayName: string;
}

export interface AuthResponse {
  user: Omit<User, 'password'>;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

// User API Types
export interface UpdateUserRequest {
  displayName?: string;
  avatar?: string;
  status?: 'online' | 'offline' | 'away' | 'busy';
}

export interface UpdatePreferencesRequest extends Partial<UserPreferences> {}

export interface SearchUsersRequest {
  query: string;
  limit?: number;
  exclude?: string[];
}

export interface SearchUsersResponse {
  users: Omit<User, 'password' | 'email'>[];
}

// Conversation API Types
export interface CreateConversationRequest {
  type: 'direct' | 'group';
  participants: string[];
  name?: string;
  description?: string;
}

export interface UpdateConversationRequest {
  name?: string;
  description?: string;
  avatar?: string;
}

export interface GetConversationsRequest {
  page?: number;
  limit?: number;
  archived?: boolean;
}

export interface AddParticipantsRequest {
  userIds: string[];
}

export interface RemoveParticipantRequest {
  userId: string;
}

export interface LeaveConversationRequest {
  conversationId: string;
}

// Message API Types
export interface SendMessageRequest {
  conversationId: string;
  type: 'text' | 'image' | 'file' | 'video' | 'audio';
  content: string;
  attachments?: string[]; // attachment IDs
  replyTo?: string;
}

export interface GetMessagesRequest {
  conversationId: string;
  page?: number;
  limit?: number;
  before?: string; // message ID
  after?: string; // message ID
}

export interface UpdateMessageRequest {
  messageId: string;
  content: string;
}

export interface DeleteMessageRequest {
  messageId: string;
  deleteForEveryone?: boolean;
}

export interface AddReactionRequest {
  messageId: string;
  emoji: string;
}

export interface RemoveReactionRequest {
  messageId: string;
  emoji: string;
}

export interface MarkAsReadRequest {
  conversationId: string;
  messageId: string;
}

// Upload API Types
export interface PresignedUploadRequest {
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface PresignedUploadResponse {
  uploadUrl: string;
  fileUrl: string;
  fileId: string;
  fields?: Record<string, string>;
}

export interface CompleteUploadRequest {
  fileId: string;
  etag?: string;
}

// Push API Types
export interface SavePushSubscriptionRequest {
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
  userAgent?: string;
}

export interface SendPushNotificationRequest {
  userId: string;
  title: string;
  body: string;
  data?: any;
  icon?: string;
  badge?: string;
  tag?: string;
}

// Error Types
export enum ApiErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  CONVERSATION_NOT_FOUND = 'CONVERSATION_NOT_FOUND',
  MESSAGE_NOT_FOUND = 'MESSAGE_NOT_FOUND',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  DUPLICATE_EMAIL = 'DUPLICATE_EMAIL',
  DUPLICATE_USERNAME = 'DUPLICATE_USERNAME',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
  UPLOAD_FAILED = 'UPLOAD_FAILED'
}

// Pagination helpers
export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Health Check
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  services: {
    database: 'healthy' | 'unhealthy';
    redis: 'healthy' | 'unhealthy';
    storage: 'healthy' | 'unhealthy';
  };
  version: string;
}
