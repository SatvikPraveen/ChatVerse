import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import type { Attachment, EncryptedPayload, Message, MessageKind } from '@chatverse/protocol';
import { toIso } from '../../lib/time.js';

export interface AttachmentEmbed {
  id: Types.ObjectId;
  name: string;
  size: number;
  mimeType: string;
  url: string;
  width?: number;
  height?: number;
  durationMs?: number;
  thumbnailUrl?: string;
}

export interface ReactionDoc {
  emoji: string;
  userIds: Types.ObjectId[];
}

export interface MessageDoc {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  seq: number;
  clientMsgId: string;
  senderId: Types.ObjectId;
  kind: MessageKind;
  text: string | null;
  encrypted: EncryptedPayload | null;
  attachments: AttachmentEmbed[];
  replyTo: Types.ObjectId | null;
  reactions: ReactionDoc[];
  editedAt: Date | null;
  deletedAt: Date | null;
  hlc: string;
  createdAt: Date;
  updatedAt: Date;
}

export type MessageDocument = HydratedDocument<MessageDoc>;

const attachmentSchema = new Schema<AttachmentEmbed>(
  {
    id: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    size: { type: Number, required: true },
    mimeType: { type: String, required: true },
    url: { type: String, required: true },
    width: Number,
    height: Number,
    durationMs: Number,
    thumbnailUrl: String,
  },
  { _id: false },
);

const messageSchema = new Schema<MessageDoc>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    seq: { type: Number, required: true },
    clientMsgId: { type: String, required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['text', 'image', 'file', 'audio', 'video', 'system', 'encrypted'], required: true },
    text: { type: String, default: null },
    encrypted: {
      type: new Schema<EncryptedPayload>(
        { v: { type: Number, required: true }, suite: { type: String, required: true }, header: { type: String, required: true }, ciphertext: { type: String, required: true } },
        { _id: false },
      ),
      default: null,
    },
    attachments: { type: [attachmentSchema], default: [] },
    replyTo: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    reactions: {
      type: [new Schema<ReactionDoc>({ emoji: { type: String, required: true }, userIds: [{ type: Schema.Types.ObjectId }] }, { _id: false })],
      default: [],
    },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    hlc: { type: String, required: true },
  },
  { timestamps: true, versionKey: false },
);

// Total order per conversation; also the index that serves history and sync queries.
messageSchema.index({ conversationId: 1, seq: 1 }, { unique: true });
// Idempotency: a retried send with the same client id maps to the same message.
messageSchema.index({ conversationId: 1, senderId: 1, clientMsgId: 1 }, { unique: true });
messageSchema.index({ hlc: 1 });
messageSchema.index({ text: 'text' });

export const MessageModel = model<MessageDoc>('Message', messageSchema);

/**
 * Message retention is an index property, so it can only be chosen before the index exists.
 * Called once at startup; a change in MESSAGE_RETENTION_DAYS requires dropping the index.
 */
export async function ensureRetentionIndex(retentionDays: number): Promise<void> {
  if (retentionDays <= 0) return;
  await MessageModel.collection.createIndex(
    { createdAt: 1 },
    { expireAfterSeconds: retentionDays * 86_400, name: 'message_retention_ttl' },
  );
}

export function toAttachment(a: AttachmentEmbed): Attachment {
  const out: Attachment = { id: a.id.toString(), name: a.name, size: a.size, mimeType: a.mimeType, url: a.url };
  if (a.width !== undefined) out.width = a.width;
  if (a.height !== undefined) out.height = a.height;
  if (a.durationMs !== undefined) out.durationMs = a.durationMs;
  if (a.thumbnailUrl !== undefined) out.thumbnailUrl = a.thumbnailUrl;
  return out;
}

export function toMessage(m: MessageDoc): Message {
  const deleted = m.deletedAt !== null;
  return {
    id: m._id.toString(),
    conversationId: m.conversationId.toString(),
    seq: m.seq,
    clientMsgId: m.clientMsgId,
    senderId: m.senderId.toString(),
    kind: m.kind,
    text: deleted ? null : (m.text ?? null),
    encrypted: deleted ? null : m.encrypted ? { v: 1, suite: m.encrypted.suite, header: m.encrypted.header, ciphertext: m.encrypted.ciphertext } : null,
    attachments: deleted ? [] : m.attachments.map(toAttachment),
    replyTo: m.replyTo ? m.replyTo.toString() : null,
    reactions: m.reactions.map((r) => ({ emoji: r.emoji, userIds: r.userIds.map((u) => u.toString()) })),
    editedAt: toIso(m.editedAt),
    deletedAt: toIso(m.deletedAt),
    hlc: m.hlc,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}
