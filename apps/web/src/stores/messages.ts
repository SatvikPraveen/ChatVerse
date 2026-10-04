import type { Message, MessageKind } from '@chatverse/protocol';
import { create } from 'zustand';

/**
 * Per-conversation message state.
 *
 *  - `byId`/`order`: server-acknowledged messages ordered by their dense `seq`
 *  - `pending`: optimistic messages keyed by the client idempotency key. When the server echoes
 *    a message with the same `clientMsgId` the pending entry is removed and its plaintext is
 *    carried over, so an encrypted echo never has to be decrypted by its own sender.
 *  - `plaintext`: decrypted text per message id (the server only ever sees ciphertext)
 *  - `decrypt`: why a message has no plaintext yet, for UI placeholders and retry
 */

export type PendingStatus = 'sending' | 'queued' | 'failed';

export interface PendingMessage {
  clientMsgId: string;
  conversationId: string;
  senderId: string;
  kind: MessageKind;
  text: string;
  replyTo: string | null;
  createdAt: string;
  status: PendingStatus;
  error?: string;
}

export type DecryptStatus = 'waiting-keys' | 'other-device' | 'failed' | 'hidden';

interface ConversationMessages {
  byId: Record<string, Message>;
  order: string[];
  /** Whether messages older than the oldest loaded one exist on the server. */
  hasOlder: boolean;
  loaded: boolean;
}

interface MessagesState {
  conversations: Record<string, ConversationMessages>;
  pending: Record<string, PendingMessage>;
  plaintext: Record<string, string>;
  decrypt: Record<string, DecryptStatus>;
  upsert(message: Message): void;
  upsertMany(conversationId: string, messages: Message[], opts?: { hasOlder?: boolean }): void;
  remove(conversationId: string, messageId: string): void;
  addPending(message: PendingMessage): void;
  setPendingStatus(clientMsgId: string, status: PendingStatus, error?: string): void;
  removePending(clientMsgId: string): void;
  setPlaintext(messageId: string, text: string): void;
  setDecryptStatus(messageId: string, status: DecryptStatus | null): void;
  reset(): void;
}

const empty = (): ConversationMessages => ({ byId: {}, order: [], hasOlder: true, loaded: false });

function sortBySeq(byId: Record<string, Message>): string[] {
  return Object.values(byId)
    .sort((a, b) => a.seq - b.seq)
    .map((m) => m.id);
}

export const useMessagesStore = create<MessagesState>((set) => ({
  conversations: {},
  pending: {},
  plaintext: {},
  decrypt: {},

  upsert: (message) =>
    set((s) => {
      const conv = s.conversations[message.conversationId] ?? empty();
      const byId = { ...conv.byId, [message.id]: message };
      const next: Partial<MessagesState> = {
        conversations: {
          ...s.conversations,
          [message.conversationId]: { ...conv, byId, order: sortBySeq(byId) },
        },
      };
      // Resolve the optimistic copy sent from this device.
      const pending = s.pending[message.clientMsgId];
      if (pending && pending.senderId === message.senderId) {
        const rest = { ...s.pending };
        delete rest[message.clientMsgId];
        next.pending = rest;
        if (!s.plaintext[message.id] && pending.text)
          next.plaintext = { ...s.plaintext, [message.id]: pending.text };
      }
      return next;
    }),

  upsertMany: (conversationId, messages, opts) =>
    set((s) => {
      const conv = s.conversations[conversationId] ?? empty();
      const byId = { ...conv.byId };
      const pending = { ...s.pending };
      const plaintext = { ...s.plaintext };
      for (const m of messages) {
        byId[m.id] = m;
        const p = pending[m.clientMsgId];
        if (p && p.senderId === m.senderId) {
          delete pending[m.clientMsgId];
          if (!plaintext[m.id] && p.text) plaintext[m.id] = p.text;
        }
      }
      return {
        conversations: {
          ...s.conversations,
          [conversationId]: {
            byId,
            order: sortBySeq(byId),
            hasOlder: opts?.hasOlder ?? conv.hasOlder,
            loaded: true,
          },
        },
        pending,
        plaintext,
      };
    }),

  remove: (conversationId, messageId) =>
    set((s) => {
      const conv = s.conversations[conversationId];
      if (!conv) return s;
      const byId = { ...conv.byId };
      delete byId[messageId];
      return {
        conversations: {
          ...s.conversations,
          [conversationId]: { ...conv, byId, order: sortBySeq(byId) },
        },
      };
    }),

  addPending: (message) =>
    set((s) => ({ pending: { ...s.pending, [message.clientMsgId]: message } })),

  setPendingStatus: (clientMsgId, status, error) =>
    set((s) => {
      const p = s.pending[clientMsgId];
      if (!p) return s;
      const updated: PendingMessage =
        error === undefined ? { ...p, status } : { ...p, status, error };
      return { pending: { ...s.pending, [clientMsgId]: updated } };
    }),

  removePending: (clientMsgId) =>
    set((s) => {
      const pending = { ...s.pending };
      delete pending[clientMsgId];
      return { pending };
    }),

  setPlaintext: (messageId, text) =>
    set((s) => {
      const decrypt = { ...s.decrypt };
      delete decrypt[messageId];
      return { plaintext: { ...s.plaintext, [messageId]: text }, decrypt };
    }),

  setDecryptStatus: (messageId, status) =>
    set((s) => {
      const decrypt = { ...s.decrypt };
      if (status) decrypt[messageId] = status;
      else delete decrypt[messageId];
      return { decrypt };
    }),

  reset: () => set({ conversations: {}, pending: {}, plaintext: {}, decrypt: {} }),
}));

/** Highest contiguous seq held for a conversation, or 0 when nothing is loaded. */
export function highestSeq(state: MessagesState, conversationId: string): number {
  const conv = state.conversations[conversationId];
  if (!conv || conv.order.length === 0) return 0;
  return conv.byId[conv.order[conv.order.length - 1]!]?.seq ?? 0;
}

export function lowestSeq(state: MessagesState, conversationId: string): number | null {
  const conv = state.conversations[conversationId];
  if (!conv || conv.order.length === 0) return null;
  return conv.byId[conv.order[0]!]?.seq ?? null;
}
