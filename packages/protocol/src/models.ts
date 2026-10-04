/**
 * Wire-level domain models. All identifiers are opaque strings (MongoDB ObjectIds on the
 * reference server) and all timestamps are ISO-8601 strings so that JSON round-trips losslessly.
 */

export type ID = string;
export type ISODate = string;

// ---------------------------------------------------------------------------
// Users & presence
// ---------------------------------------------------------------------------

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  notifications: { push: boolean; sound: boolean };
  privacy: { showOnlineStatus: boolean; readReceipts: boolean };
}

/** The projection of a user that any authenticated user may see. */
export interface PublicUser {
  id: ID;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: ISODate;
}

/** The projection a user sees of themselves. */
export interface UserProfile extends PublicUser {
  email: string;
  settings: UserSettings;
  updatedAt: ISODate;
}

export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline';

export interface Presence {
  userId: ID;
  status: PresenceStatus;
  /** Last time any device of this user was seen (ISO). */
  lastSeen: ISODate;
  /** Number of concurrently connected devices (0 when offline). */
  deviceCount: number;
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export type ConversationKind = 'direct' | 'group';
export type ParticipantRole = 'owner' | 'admin' | 'member';

export interface Participant {
  userId: ID;
  role: ParticipantRole;
  joinedAt: ISODate;
  /**
   * Receipt watermarks. Storing a per-participant high-water mark instead of a per-message
   * readBy array makes receipts O(participants) per conversation rather than O(messages).
   */
  lastReadSeq: number;
  lastDeliveredSeq: number;
  muted: boolean;
}

export type MessageKind = 'text' | 'image' | 'file' | 'audio' | 'video' | 'system' | 'encrypted';

export interface MessagePreview {
  id: ID;
  seq: number;
  senderId: ID;
  kind: MessageKind;
  /** Null for encrypted messages: the server never sees plaintext. */
  text: string | null;
  createdAt: ISODate;
}

export interface Conversation {
  id: ID;
  kind: ConversationKind;
  name: string | null;
  topic: string | null;
  avatarUrl: string | null;
  createdBy: ID;
  participants: Participant[];
  /** When true, clients must send `kind: 'encrypted'` messages only. */
  encrypted: boolean;
  /**
   * Highest sequence number assigned in this conversation. Sequence numbers are dense
   * (1, 2, 3, ...) and totally ordered per conversation, which lets clients detect gaps and
   * resume synchronisation from any point with `sync:pull`.
   */
  headSeq: number;
  lastMessage: MessagePreview | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface Attachment {
  id: ID;
  name: string;
  size: number;
  mimeType: string;
  url: string;
  width?: number;
  height?: number;
  durationMs?: number;
  thumbnailUrl?: string;
}

export interface Reaction {
  emoji: string;
  userIds: ID[];
}

/**
 * Opaque end-to-end encrypted payload. The server stores and forwards it verbatim.
 * `suite` identifies the cipher suite (see @chatverse/crypto); `header` and `ciphertext`
 * are base64url. For group conversations the sender-key id lives inside the header.
 */
export interface EncryptedPayload {
  v: 1;
  suite: string;
  header: string;
  ciphertext: string;
}

export interface Message {
  id: ID;
  conversationId: ID;
  /** Dense, per-conversation sequence number assigned by the server. */
  seq: number;
  /**
   * Client-generated idempotency key (UUID). Re-sending a message with the same
   * (conversationId, senderId, clientMsgId) returns the original message instead of
   * creating a duplicate, which makes retries after disconnects safe.
   */
  clientMsgId: string;
  senderId: ID;
  kind: MessageKind;
  text: string | null;
  encrypted: EncryptedPayload | null;
  attachments: Attachment[];
  replyTo: ID | null;
  reactions: Reaction[];
  editedAt: ISODate | null;
  deletedAt: ISODate | null;
  /**
   * Hybrid logical clock timestamp. Totally ordered and causally consistent across
   * conversations and nodes even with modest wall-clock skew. See ./hlc.ts.
   */
  hlc: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

// ---------------------------------------------------------------------------
// E2EE key material (public parts only — private keys never leave the device)
// ---------------------------------------------------------------------------

export interface SignedPreKey {
  id: number;
  publicKey: string;
  /** Ed25519 signature over `publicKey` made with the identity signing key. */
  signature: string;
}

export interface OneTimePreKey {
  id: number;
  publicKey: string;
}

export interface PreKeyBundleUpload {
  deviceId: string;
  identityKey: string;
  signingKey: string;
  signedPreKey: SignedPreKey;
  oneTimePreKeys: OneTimePreKey[];
}

/** What a peer receives when it wants to start an X3DH session with a device. */
export interface PreKeyBundle {
  userId: ID;
  deviceId: string;
  identityKey: string;
  signingKey: string;
  signedPreKey: SignedPreKey;
  /** Consumed on fetch; may be absent when the device ran out of one-time pre-keys. */
  oneTimePreKey: OneTimePreKey | null;
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}
