import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import type {
  Conversation,
  ConversationKind,
  MessageKind,
  Participant,
  ParticipantRole,
} from '@chatverse/protocol';

export interface ParticipantDoc {
  userId: Types.ObjectId;
  role: ParticipantRole;
  joinedAt: Date;
  lastReadSeq: number;
  lastDeliveredSeq: number;
  muted: boolean;
}

export interface LastMessageDoc {
  id: Types.ObjectId;
  seq: number;
  senderId: Types.ObjectId;
  kind: MessageKind;
  text: string | null;
  createdAt: Date;
}

export interface ConversationDoc {
  _id: Types.ObjectId;
  kind: ConversationKind;
  name: string | null;
  topic: string | null;
  avatarUrl: string | null;
  createdBy: Types.ObjectId;
  participants: ParticipantDoc[];
  encrypted: boolean;
  /** Highest assigned sequence number. The authoritative value lives here; Redis caches it. */
  headSeq: number;
  lastMessage: LastMessageDoc | null;
  /** "minUserId:maxUserId" for direct conversations; makes direct creation idempotent. Absent for groups. */
  directKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ConversationDocument = HydratedDocument<ConversationDoc>;

const participantSchema = new Schema<ParticipantDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
    joinedAt: { type: Date, default: () => new Date() },
    lastReadSeq: { type: Number, default: 0 },
    lastDeliveredSeq: { type: Number, default: 0 },
    muted: { type: Boolean, default: false },
  },
  { _id: false },
);

const conversationSchema = new Schema<ConversationDoc>(
  {
    kind: { type: String, enum: ['direct', 'group'], required: true },
    name: { type: String, default: null },
    topic: { type: String, default: null },
    avatarUrl: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    participants: { type: [participantSchema], default: [] },
    encrypted: { type: Boolean, default: false },
    headSeq: { type: Number, default: 0 },
    lastMessage: {
      type: new Schema<LastMessageDoc>(
        {
          id: { type: Schema.Types.ObjectId, required: true },
          seq: { type: Number, required: true },
          senderId: { type: Schema.Types.ObjectId, required: true },
          kind: { type: String, required: true },
          text: { type: String, default: null },
          createdAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    // No default on purpose: a sparse unique index ignores documents where the field is *absent*,
    // but would index an explicit null and make the second group conversation collide.
    directKey: { type: String },
  },
  { timestamps: true, versionKey: false },
);

conversationSchema.index({ directKey: 1 }, { unique: true, sparse: true });
conversationSchema.index({ 'participants.userId': 1, updatedAt: -1 });

export const ConversationModel = model<ConversationDoc>('Conversation', conversationSchema);

export function toParticipant(p: ParticipantDoc): Participant {
  return {
    userId: p.userId.toString(),
    role: p.role,
    joinedAt: p.joinedAt.toISOString(),
    lastReadSeq: p.lastReadSeq,
    lastDeliveredSeq: p.lastDeliveredSeq,
    muted: p.muted,
  };
}

export function toConversation(c: ConversationDoc): Conversation {
  return {
    id: c._id.toString(),
    kind: c.kind,
    name: c.name ?? null,
    topic: c.topic ?? null,
    avatarUrl: c.avatarUrl ?? null,
    createdBy: c.createdBy.toString(),
    participants: c.participants.map(toParticipant),
    encrypted: c.encrypted,
    headSeq: c.headSeq,
    lastMessage: c.lastMessage
      ? {
          id: c.lastMessage.id.toString(),
          seq: c.lastMessage.seq,
          senderId: c.lastMessage.senderId.toString(),
          kind: c.lastMessage.kind,
          text: c.lastMessage.text ?? null,
          createdAt: c.lastMessage.createdAt.toISOString(),
        }
      : null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function findParticipant(c: ConversationDoc, userId: string): ParticipantDoc | undefined {
  return c.participants.find((p) => p.userId.toString() === userId);
}

export function participantIds(c: ConversationDoc): string[] {
  return c.participants.map((p) => p.userId.toString());
}
