import type { Conversation, EncryptedPayload, Message, MessagePreview, PublicUser } from '@chatverse/protocol';
import { useAuthStore } from '@/stores/auth';
import { useConversationsStore } from '@/stores/conversations';
import { lowestSeq, useMessagesStore, type PendingMessage } from '@/stores/messages';
import { usePresenceStore } from '@/stores/presence';
import { useUiStore } from '@/stores/ui';
import { useUsersStore } from '@/stores/users';
import { ApiClientError } from './api';
import type { OutboxItem } from './outbox';
import { noteDelivered } from './receipts';
import { api, getRuntime, requireRuntime } from './session';
import { emitWithAck } from './socket';

/**
 * Application-level message operations: loading history, ingesting (and decrypting) messages,
 * sending through the outbox, edits, deletes, reactions and typing.
 */

const PAGE = 50;

// ---------------------------------------------------------------------------------------------
// Conversations & users
// ---------------------------------------------------------------------------------------------

export async function loadConversations(): Promise<void> {
  const page = await api.conversations.list(null, 100);
  useConversationsStore.getState().upsertMany(page.items, page.nextCursor);
  const r = getRuntime();
  if (!r) return;
  const ids = new Set<string>();
  for (const c of page.items) for (const p of c.participants) if (p.userId !== r.userId) ids.add(p.userId);
  await Promise.all([ensureUsers([...ids]), refreshPresence([...ids])]);
}

export async function loadMoreConversations(): Promise<void> {
  const { nextCursor } = useConversationsStore.getState();
  if (!nextCursor) return;
  const page = await api.conversations.list(nextCursor, 100);
  useConversationsStore.getState().upsertMany(page.items, page.nextCursor);
}

/** Fetch public profiles we have not cached yet. */
export async function ensureUsers(userIds: string[]): Promise<void> {
  const known = useUsersStore.getState().byId;
  const missing = [...new Set(userIds)].filter((id) => !known[id]);
  if (missing.length === 0) return;
  const users = await Promise.all(missing.map((id) => api.users.get(id).catch((): PublicUser | null => null)));
  useUsersStore.getState().upsertMany(users.filter((u): u is PublicUser => u !== null));
}

export async function refreshPresence(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const list = await api.users.presence(userIds).catch(() => []);
  usePresenceStore.getState().setMany(list);
}

async function conversationFor(id: string): Promise<Conversation | null> {
  const cached = useConversationsStore.getState().byId[id];
  if (cached) return cached;
  try {
    const c = await api.conversations.get(id);
    useConversationsStore.getState().upsert(c);
    void ensureUsers(c.participants.map((p) => p.userId));
    return c;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Ingest & decrypt
// ---------------------------------------------------------------------------------------------

function preview(m: Message): MessagePreview {
  return { id: m.id, seq: m.seq, senderId: m.senderId, kind: m.kind, text: m.text, createdAt: m.createdAt };
}

/**
 * Store messages, decrypt what we can and update conversation heads. Called for history pages,
 * sync pulls and live events alike; every step is idempotent.
 */
export async function ingestMessages(conversationId: string, messages: Message[], opts?: { hasOlder?: boolean }): Promise<void> {
  if (messages.length === 0) {
    if (opts?.hasOlder !== undefined) useMessagesStore.getState().upsertMany(conversationId, [], opts);
    return;
  }
  const store = useMessagesStore.getState();
  store.upsertMany(conversationId, messages, opts);
  const conversation = await conversationFor(conversationId);
  const r = getRuntime();
  let controlReceived = false;
  for (const m of messages) {
    if (m.kind !== 'encrypted' || !conversation || !r) continue;
    if (useMessagesStore.getState().plaintext[m.id] !== undefined) continue;
    const outcome = await r.e2ee.decrypt(conversation, m);
    const s = useMessagesStore.getState();
    switch (outcome.kind) {
      case 'text':
        s.setPlaintext(m.id, outcome.text);
        break;
      case 'control':
        controlReceived = true;
        s.setDecryptStatus(m.id, 'hidden');
        break;
      case 'hidden':
        s.setDecryptStatus(m.id, 'hidden');
        break;
      case 'waiting-keys':
        s.setDecryptStatus(m.id, 'waiting-keys');
        break;
      case 'other-device':
        s.setDecryptStatus(m.id, 'other-device');
        break;
      case 'failed':
        s.setDecryptStatus(m.id, 'failed');
        break;
    }
  }
  const last = messages.reduce((a, b) => (a.seq > b.seq ? a : b));
  const convStore = useConversationsStore.getState();
  if (convStore.byId[conversationId]) convStore.setHead(conversationId, last.seq, preview(last));
  if (controlReceived) await retryWaiting(conversationId);
}

/** Re-attempt decryption of messages that were waiting for a sender key. */
export async function retryWaiting(conversationId: string): Promise<void> {
  const s = useMessagesStore.getState();
  const conv = s.conversations[conversationId];
  if (!conv) return;
  const waiting = conv.order.map((id) => conv.byId[id]!).filter((m) => s.decrypt[m.id] === 'waiting-keys');
  if (waiting.length === 0) return;
  for (const m of waiting) s.setDecryptStatus(m.id, null);
  await ingestMessages(conversationId, waiting);
}

/** Live message from the socket: ingest through the synchroniser and acknowledge delivery. */
export async function onLiveMessage(message: Message): Promise<void> {
  const r = requireRuntime();
  await r.sync.onIncoming(message);
  if (message.senderId !== r.userId) noteDelivered(message.conversationId, message.seq);
}

// ---------------------------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------------------------

/** Join the room and load the latest page. Safe to call repeatedly. */
export async function openConversation(conversationId: string): Promise<void> {
  const r = requireRuntime();
  const conversation = await conversationFor(conversationId);
  if (!conversation) return;
  void ensureUsers(conversation.participants.map((p) => p.userId));
  if (r.socket.connected) {
    await emitWithAck('conversation:join', { conversationId }).catch(() => undefined);
  }
  const state = useMessagesStore.getState().conversations[conversationId];
  if (state?.loaded) {
    await r.sync.catchUp(conversationId).catch(() => undefined);
    return;
  }
  const page = await api.conversations.messages(conversationId, { limit: PAGE });
  const hasOlder = page.items.length > 0 ? page.items[0]!.seq > 1 : false;
  await ingestMessages(conversationId, page.items, { hasOlder });
  r.sync.setKnown(conversationId, page.headSeq);
}

export async function loadOlder(conversationId: string): Promise<void> {
  const before = lowestSeq(useMessagesStore.getState(), conversationId);
  if (before === null || before <= 1) return;
  const page = await api.conversations.messages(conversationId, { beforeSeq: before, limit: PAGE });
  const hasOlder = page.items.length > 0 ? page.items[0]!.seq > 1 : false;
  await ingestMessages(conversationId, page.items, { hasOlder });
}

// ---------------------------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------------------------

export async function sendText(conversationId: string, text: string, replyTo: string | null = null): Promise<void> {
  const r = requireRuntime();
  const conversation = await conversationFor(conversationId);
  if (!conversation) throw new Error('unknown conversation');
  const clientMsgId = crypto.randomUUID();
  const pending: PendingMessage = {
    clientMsgId,
    conversationId,
    senderId: r.userId,
    kind: conversation.encrypted ? 'encrypted' : 'text',
    text,
    replyTo,
    createdAt: new Date().toISOString(),
    status: 'sending',
  };
  useMessagesStore.getState().addPending(pending);

  const base = { conversationId, control: false as const, ...(replyTo ? { replyTo } : {}) };
  if (!conversation.encrypted) {
    await r.outbox.enqueue({ ...base, clientMsgId, kind: 'text', text });
  } else {
    // Encrypt eagerly when possible so the ciphertext is durable; fall back to deferred
    // encryption (plaintext stays local in the outbox) when key fetching needs the network.
    try {
      const { payload, preamble } = await r.e2ee.encrypt(conversation, text);
      for (const control of preamble) {
        await r.outbox.enqueue({ conversationId, clientMsgId: crypto.randomUUID(), kind: 'encrypted', encrypted: control, control: true });
      }
      await r.outbox.enqueue({ ...base, clientMsgId, kind: 'encrypted', encrypted: payload, text });
    } catch (err) {
      if (err instanceof ApiClientError && err.isPermanent) {
        useMessagesStore.getState().setPendingStatus(clientMsgId, 'failed', err.message);
        throw err;
      }
      await r.outbox.enqueue({ ...base, clientMsgId, kind: 'encrypted', text });
    }
  }
  void r.outbox.flush();
}

/** Deferred encryption for outbox items created while offline. */
export async function encryptOutboxItem(item: OutboxItem): Promise<EncryptedPayload> {
  const r = requireRuntime();
  const conversation = await conversationFor(item.conversationId);
  if (!conversation || item.text === undefined) throw new ApiClientError('NOT_FOUND', 'conversation unavailable', 404);
  const { payload, preamble } = await r.e2ee.encrypt(conversation, item.text);
  // Any distribution produced now is sent directly; the outbox item is already at the head.
  for (const control of preamble) {
    await emitWithAck('message:send', { conversationId: item.conversationId, clientMsgId: crypto.randomUUID(), kind: 'encrypted', encrypted: control });
  }
  return payload;
}

export function onOutboxSent(item: OutboxItem, message: Message): void {
  const r = getRuntime();
  if (item.control) {
    useMessagesStore.getState().setDecryptStatus(message.id, 'hidden');
  } else if (item.text !== undefined && r) {
    r.e2ee.rememberPlaintext(message.id, item.text);
  }
  void ingestMessages(message.conversationId, [message]);
  r?.sync.setKnown(message.conversationId, message.seq);
}

export function onOutboxFailed(item: OutboxItem, error: Error): void {
  if (item.control) return;
  useMessagesStore.getState().setPendingStatus(item.clientMsgId, 'failed', error.message);
  useUiStore.getState().toast('error', `Message not sent: ${error.message}`);
}

export async function retryPending(clientMsgId: string): Promise<void> {
  const r = requireRuntime();
  useMessagesStore.getState().setPendingStatus(clientMsgId, 'sending');
  await r.outbox.retryNow(clientMsgId);
}

export async function discardPending(clientMsgId: string): Promise<void> {
  const r = requireRuntime();
  await r.outbox.remove(clientMsgId);
  useMessagesStore.getState().removePending(clientMsgId);
}

// ---------------------------------------------------------------------------------------------
// Edit / delete / react / typing
// ---------------------------------------------------------------------------------------------

export async function editMessage(message: Message, text: string): Promise<void> {
  const r = requireRuntime();
  const conversation = await conversationFor(message.conversationId);
  if (!conversation) return;
  let result;
  if (conversation.encrypted) {
    const { payload, preamble } = await r.e2ee.encrypt(conversation, text);
    for (const control of preamble) {
      await emitWithAck('message:send', { conversationId: conversation.id, clientMsgId: crypto.randomUUID(), kind: 'encrypted', encrypted: control });
    }
    result = await emitWithAck('message:edit', { messageId: message.id, encrypted: payload });
    r.e2ee.rememberPlaintext(message.id, text);
    useMessagesStore.getState().setPlaintext(message.id, text);
  } else {
    result = await emitWithAck('message:edit', { messageId: message.id, text });
  }
  useMessagesStore.getState().upsert(result.message);
}

export async function deleteMessage(message: Message): Promise<void> {
  await emitWithAck('message:delete', { messageId: message.id });
  useMessagesStore.getState().upsert({ ...message, deletedAt: new Date().toISOString(), text: null, encrypted: null });
}

export async function toggleReaction(message: Message, emoji: string): Promise<void> {
  const { message: updated } = await emitWithAck('reaction:toggle', { messageId: message.id, emoji });
  useMessagesStore.getState().upsert(updated);
}

const typingLastSent = new Map<string, number>();
const TYPING_THROTTLE_MS = 2_000;

/** Throttled typing notifications; `false` is always sent immediately. */
export function setTyping(conversationId: string, isTyping: boolean): void {
  const socket = getRuntime()?.socket;
  if (!socket?.connected) return;
  const now = Date.now();
  if (isTyping && now - (typingLastSent.get(conversationId) ?? 0) < TYPING_THROTTLE_MS) return;
  typingLastSent.set(conversationId, isTyping ? now : 0);
  socket.emit('typing', { conversationId, isTyping });
}

export function setPresence(status: 'online' | 'away' | 'busy'): void {
  getRuntime()?.socket.emit('presence:set', { status });
}

export function currentUserId(): string {
  return useAuthStore.getState().user?.id ?? '';
}
