import type {
  Conversation,
  ID,
  Message,
  PreKeyBundle,
  Presence,
  PublicUser,
  UserProfile,
} from './models.js';
import type { ApiError } from './errors.js';

/** All REST responses share this envelope. */
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** Cursor pagination: opaque cursor, caller passes it back as `?cursor=`. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

// Auth --------------------------------------------------------------------

export interface AuthTokens {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: UserProfile;
}

export interface RegisterBody {
  username: string;
  email: string;
  password: string;
  displayName: string;
}

export interface LoginBody {
  email: string;
  password: string;
  deviceId?: string;
}

export interface RefreshBody {
  refreshToken: string;
}

// Users -------------------------------------------------------------------

export type MeResponse = UserProfile;
export type UserResponse = PublicUser;
export type UserSearchResponse = PublicUser[];
export type PresenceResponse = Presence[];

// Conversations -----------------------------------------------------------

export interface CreateConversationBody {
  kind: 'direct' | 'group';
  participantIds: ID[];
  name?: string;
  topic?: string;
  encrypted?: boolean;
}

export interface UpdateConversationBody {
  name?: string;
  topic?: string | null;
  avatarUrl?: string | null;
}

export type ConversationsResponse = Page<Conversation>;
export type ConversationResponse = Conversation;

// Messages ----------------------------------------------------------------

export interface MessagesQuery {
  /** Return messages with seq < beforeSeq (history scroll-back). */
  beforeSeq?: number;
  /** Return messages with seq > afterSeq (catch-up). Mutually exclusive with beforeSeq. */
  afterSeq?: number;
  limit?: number;
}

export interface MessagesResponse {
  items: Message[];
  headSeq: number;
  hasMore: boolean;
}

export interface MessageSearchQuery {
  q: string;
  conversationId?: ID;
  limit?: number;
}

// Keys --------------------------------------------------------------------

export type PreKeyBundleResponse = PreKeyBundle;
export interface PreKeyCountResponse {
  deviceId: string;
  oneTimePreKeys: number;
}

// Uploads -----------------------------------------------------------------

export interface PresignUploadBody {
  fileName: string;
  size: number;
  mimeType: string;
}

export interface PresignUploadResponse {
  attachmentId: ID;
  uploadUrl: string;
  /** Headers the client must send with the PUT. */
  headers: Record<string, string>;
  publicUrl: string;
  expiresAt: string;
}

// Health ------------------------------------------------------------------

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  nodeId: string;
  uptimeSec: number;
  checks: Record<string, { status: 'ok' | 'down'; latencyMs?: number; error?: string }>;
}
