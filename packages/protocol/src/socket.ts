import type {
  Conversation,
  EncryptedPayload,
  ID,
  ISODate,
  Message,
  MessageKind,
  Presence,
  PresenceStatus,
  PublicUser,
  UserProfile,
} from './models.js';
import type { ApiError } from './errors.js';

/**
 * Acknowledgement envelope. Every client-initiated event that mutates state is acknowledged
 * so that the client can implement at-least-once delivery with idempotent retries.
 */
export type Ack<T> = { ok: true; data: T } | { ok: false; error: ApiError };
export type AckFn<T> = (ack: Ack<T>) => void;

// ---------------------------------------------------------------------------
// Client -> Server
// ---------------------------------------------------------------------------

export interface MessageSendInput {
  conversationId: ID;
  clientMsgId: string;
  kind: Exclude<MessageKind, 'system'>;
  text?: string;
  encrypted?: EncryptedPayload;
  attachmentIds?: ID[];
  replyTo?: ID;
}

export interface MessageEditInput {
  messageId: ID;
  text?: string;
  encrypted?: EncryptedPayload;
}

export interface SyncPullInput {
  conversationId: ID;
  /** Return messages with seq strictly greater than this. */
  afterSeq: number;
  limit?: number;
}

export interface SyncPullResult {
  messages: Message[];
  headSeq: number;
  /** True when more messages exist after the last returned one. */
  hasMore: boolean;
}

export interface ClientToServerEvents {
  'conversation:join': (input: { conversationId: ID }, ack: AckFn<{ headSeq: number }>) => void;
  'conversation:leave': (input: { conversationId: ID }) => void;
  'message:send': (input: MessageSendInput, ack: AckFn<{ message: Message }>) => void;
  'message:edit': (input: MessageEditInput, ack: AckFn<{ message: Message }>) => void;
  'message:delete': (input: { messageId: ID }, ack: AckFn<{ messageId: ID }>) => void;
  'reaction:toggle': (
    input: { messageId: ID; emoji: string },
    ack: AckFn<{ message: Message }>,
  ) => void;
  'receipt:delivered': (input: { conversationId: ID; seq: number }) => void;
  'receipt:read': (input: { conversationId: ID; seq: number }) => void;
  typing: (input: { conversationId: ID; isTyping: boolean }) => void;
  'presence:set': (input: { status: Exclude<PresenceStatus, 'offline'> }) => void;
  'sync:pull': (input: SyncPullInput, ack: AckFn<SyncPullResult>) => void;
  ping: (ack: AckFn<{ serverTime: ISODate; hlc: string }>) => void;
}

// ---------------------------------------------------------------------------
// Server -> Client
// ---------------------------------------------------------------------------

export interface ReceiptUpdate {
  conversationId: ID;
  userId: ID;
  lastDeliveredSeq: number;
  lastReadSeq: number;
}

export interface ServerToClientEvents {
  /** Emitted once after authentication. */
  'session:ready': (data: {
    user: UserProfile;
    serverTime: ISODate;
    hlc: string;
    nodeId: string;
    protocolVersion: number;
  }) => void;
  'message:new': (data: { message: Message }) => void;
  'message:updated': (data: { message: Message }) => void;
  'message:deleted': (data: { conversationId: ID; messageId: ID; seq: number }) => void;
  'receipt:updated': (data: ReceiptUpdate) => void;
  typing: (data: { conversationId: ID; userId: ID; isTyping: boolean }) => void;
  'presence:changed': (data: Presence) => void;
  'conversation:added': (data: { conversation: Conversation }) => void;
  'conversation:updated': (data: { conversation: Conversation }) => void;
  'conversation:removed': (data: { conversationId: ID }) => void;
  'user:updated': (data: { user: PublicUser }) => void;
  'rate:limited': (data: { event: string; retryAfterMs: number }) => void;
  /** Non-ack error channel for fire-and-forget events. */
  'protocol:error': (data: ApiError) => void;
}

/** Data the server attaches to every authenticated socket. */
export interface SocketData {
  userId: ID;
  deviceId: string;
  sessionId: string;
}

export type ClientEventName = keyof ClientToServerEvents;
export type ServerEventName = keyof ServerToClientEvents;
