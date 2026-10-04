import { useAuthStore } from '@/stores/auth';
import { useConversationsStore } from '@/stores/conversations';
import { useMessagesStore } from '@/stores/messages';
import { usePresenceStore } from '@/stores/presence';
import { useTypingStore } from '@/stores/typing';
import { useUiStore } from '@/stores/ui';
import { useUsersStore } from '@/stores/users';
import { ensureUsers, loadConversations, onLiveMessage, refreshPresence } from './messaging';
import { resetReceiptState } from './receipts';
import { refreshAccessToken, type Runtime } from './session';
import { emitWithAck } from './socket';

/**
 * Wire socket events to the stores and to the sync/outbox machinery.
 *
 * Reconnect handling: after any disconnect, the next `connect` triggers (1) re-joining rooms by
 * catching up every tracked conversation through `sync:pull`, (2) refreshing the conversation
 * list (membership changes, new conversations), and (3) flushing the outbox.
 */
export function bindRealtime(r: Runtime): void {
  const { socket } = r;
  const ui = useUiStore.getState();
  let wasConnected = false;

  socket.on('connect', () => {
    ui.setConnection('connected');
    if (wasConnected) {
      resetReceiptState();
      void (async () => {
        // Re-join rooms first so no live event is missed while we catch up.
        await Promise.all(
          r.sync
            .trackedConversations()
            .map((id) =>
              emitWithAck('conversation:join', { conversationId: id }).catch(() => undefined),
            ),
        );
        await r.sync.resumeAll();
        await loadConversations().catch(() => undefined);
        await r.outbox.flush();
      })();
    } else {
      void r.outbox.flush();
    }
    wasConnected = true;
  });

  socket.on('disconnect', () => ui.setConnection(navigator.onLine ? 'reconnecting' : 'offline'));
  socket.io.on('reconnect_attempt', () =>
    ui.setConnection(navigator.onLine ? 'reconnecting' : 'offline'),
  );
  socket.on('connect_error', (err) => {
    ui.setConnection(navigator.onLine ? 'reconnecting' : 'offline');
    if (/auth|token|expired/i.test(err.message)) {
      // Likely an expired access token: refresh through REST; socket.io re-reads the token on
      // its next attempt because `auth` is a function.
      void refreshAccessToken();
    }
  });
  window.addEventListener('online', () => {
    if (!socket.connected) socket.connect();
  });

  socket.on('session:ready', ({ user }) => {
    useAuthStore.getState().setUser(user);
  });

  socket.on('message:new', ({ message }) => {
    void onLiveMessage(message);
    const typing = useTypingStore.getState();
    typing.set(message.conversationId, message.senderId, false);
  });

  socket.on('message:updated', ({ message }) => {
    const s = useMessagesStore.getState();
    const previous = s.conversations[message.conversationId]?.byId[message.id];
    s.upsert(message);
    const edited = message.editedAt && message.editedAt !== previous?.editedAt;
    if (
      edited &&
      message.kind === 'encrypted' &&
      message.encrypted &&
      message.senderId !== r.userId
    ) {
      // Edited ciphertext under the same id: drop the stale plaintext and decrypt the new payload.
      r.e2ee.forgetPlaintext(message.id);
      const conv = useConversationsStore.getState().byId[message.conversationId];
      if (conv) {
        void r.e2ee.decrypt(conv, message).then((o) => {
          if (o.kind === 'text') useMessagesStore.getState().setPlaintext(message.id, o.text);
        });
      }
    }
  });

  socket.on('message:deleted', ({ conversationId, messageId }) => {
    const s = useMessagesStore.getState();
    const existing = s.conversations[conversationId]?.byId[messageId];
    if (existing)
      s.upsert({ ...existing, deletedAt: new Date().toISOString(), text: null, encrypted: null });
  });

  socket.on('receipt:updated', (update) => useConversationsStore.getState().applyReceipt(update));

  socket.on('typing', ({ conversationId, userId, isTyping }) => {
    if (userId !== r.userId) useTypingStore.getState().set(conversationId, userId, isTyping);
  });

  socket.on('presence:changed', (presence) => usePresenceStore.getState().set(presence));

  socket.on('conversation:added', ({ conversation }) => {
    useConversationsStore.getState().upsert(conversation);
    const ids = conversation.participants.map((p) => p.userId).filter((id) => id !== r.userId);
    void ensureUsers(ids);
    void refreshPresence(ids);
  });

  socket.on('conversation:updated', ({ conversation }) => {
    useConversationsStore.getState().upsert(conversation);
    void ensureUsers(conversation.participants.map((p) => p.userId));
  });

  socket.on('conversation:removed', ({ conversationId }) => {
    useConversationsStore.getState().remove(conversationId);
    r.sync.forget(conversationId);
  });

  socket.on('user:updated', ({ user }) => useUsersStore.getState().upsert(user));

  socket.on('rate:limited', ({ event, retryAfterMs }) =>
    ui.toast(
      'error',
      `Slow down: ${event} is rate limited, retry in ${Math.ceil(retryAfterMs / 1000)}s`,
    ),
  );

  socket.on('protocol:error', (error) => ui.toast('error', error.message));

  // Typing indicators expire client-side as well, in case a stop event was lost.
  const sweeper = setInterval(() => useTypingStore.getState().sweep(), 1_000);
  socket.on('disconnect', (reason) => {
    if (reason === 'io client disconnect') clearInterval(sweeper); // explicit logout
  });
}
