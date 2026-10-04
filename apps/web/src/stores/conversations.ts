import type { Conversation, ReceiptUpdate } from '@chatverse/protocol';
import { create } from 'zustand';

interface ConversationsState {
  byId: Record<string, Conversation>;
  /** Conversation ids ordered by updatedAt descending. */
  order: string[];
  nextCursor: string | null;
  loaded: boolean;
  upsert(conversation: Conversation): void;
  upsertMany(conversations: Conversation[], nextCursor?: string | null): void;
  remove(id: string): void;
  applyReceipt(update: ReceiptUpdate): void;
  /** Optimistically bump the local user's read watermark. */
  setLocalRead(conversationId: string, userId: string, seq: number): void;
  setHead(conversationId: string, headSeq: number, lastMessage?: Conversation['lastMessage']): void;
  reset(): void;
}

function sortIds(byId: Record<string, Conversation>): string[] {
  return Object.values(byId)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .map((c) => c.id);
}

export const useConversationsStore = create<ConversationsState>((set) => ({
  byId: {},
  order: [],
  nextCursor: null,
  loaded: false,

  upsert: (conversation) =>
    set((s) => {
      const byId = { ...s.byId, [conversation.id]: conversation };
      return { byId, order: sortIds(byId) };
    }),

  upsertMany: (conversations, nextCursor) =>
    set((s) => {
      const byId = { ...s.byId };
      for (const c of conversations) byId[c.id] = c;
      return {
        byId,
        order: sortIds(byId),
        loaded: true,
        nextCursor: nextCursor === undefined ? s.nextCursor : nextCursor,
      };
    }),

  remove: (id) =>
    set((s) => {
      const byId = { ...s.byId };
      delete byId[id];
      return { byId, order: sortIds(byId) };
    }),

  applyReceipt: ({ conversationId, userId, lastDeliveredSeq, lastReadSeq }) =>
    set((s) => {
      const c = s.byId[conversationId];
      if (!c) return s;
      const participants = c.participants.map((p) =>
        p.userId === userId
          ? {
              ...p,
              lastDeliveredSeq: Math.max(p.lastDeliveredSeq, lastDeliveredSeq),
              lastReadSeq: Math.max(p.lastReadSeq, lastReadSeq),
            }
          : p,
      );
      return { byId: { ...s.byId, [conversationId]: { ...c, participants } } };
    }),

  setLocalRead: (conversationId, userId, seq) =>
    set((s) => {
      const c = s.byId[conversationId];
      if (!c) return s;
      const participants = c.participants.map((p) =>
        p.userId === userId && p.lastReadSeq < seq
          ? { ...p, lastReadSeq: seq, lastDeliveredSeq: Math.max(p.lastDeliveredSeq, seq) }
          : p,
      );
      return { byId: { ...s.byId, [conversationId]: { ...c, participants } } };
    }),

  setHead: (conversationId, headSeq, lastMessage) =>
    set((s) => {
      const c = s.byId[conversationId];
      if (!c || c.headSeq >= headSeq) return s;
      const updated: Conversation = {
        ...c,
        headSeq,
        lastMessage: lastMessage ?? c.lastMessage,
        updatedAt: lastMessage?.createdAt ?? new Date().toISOString(),
      };
      const byId = { ...s.byId, [conversationId]: updated };
      return { byId, order: sortIds(byId) };
    }),

  reset: () => set({ byId: {}, order: [], nextCursor: null, loaded: false }),
}));

/** Unread = messages after my read watermark. */
export function unreadCount(conversation: Conversation, userId: string): number {
  const me = conversation.participants.find((p) => p.userId === userId);
  return me ? Math.max(0, conversation.headSeq - me.lastReadSeq) : 0;
}

export function otherParticipantIds(conversation: Conversation, userId: string): string[] {
  return conversation.participants.map((p) => p.userId).filter((id) => id !== userId);
}
