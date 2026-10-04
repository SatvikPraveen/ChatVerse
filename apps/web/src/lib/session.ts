import type { PreKeyBundle } from '@chatverse/protocol';
import { useAuthStore } from '@/stores/auth';
import { useConversationsStore } from '@/stores/conversations';
import { useMessagesStore } from '@/stores/messages';
import { usePresenceStore } from '@/stores/presence';
import { useTypingStore } from '@/stores/typing';
import { useUiStore } from '@/stores/ui';
import { useUsersStore } from '@/stores/users';
import { ApiClientError, createApiClient, type TokenProvider } from './api';
import { E2EE, type KeyServer } from './crypto/e2ee';
import { getDeviceId } from './device';
import { createEndpoints } from './endpoints';
import { API_BASE } from './env';
import { Outbox } from './outbox';
import { connectSocket, disconnectSocket, emitWithAck, type AppSocket } from './socket';
import { kv } from './storage';
import { Synchronizer } from './sync';

/**
 * The per-login runtime: API client, E2EE engine, synchroniser, outbox and socket. It is a
 * module singleton so that stores, hooks and components reach it without prop drilling, and it
 * is torn down completely on logout.
 */

const tokens: TokenProvider = {
  getAccessToken: () => useAuthStore.getState().accessToken,
  async refresh() {
    const { refreshToken } = useAuthStore.getState();
    if (!refreshToken) return null;
    try {
      const auth = await api.auth.refresh(refreshToken);
      useAuthStore.getState().setSession(auth);
      return auth.accessToken;
    } catch (err) {
      // A refresh token that is expired, revoked or reused ends the session.
      if (err instanceof ApiClientError && err.status === 401) {
        void stopSession();
        useAuthStore.getState().clear();
      }
      return null;
    }
  },
};

export const api = createEndpoints(createApiClient({ baseUrl: API_BASE, tokens }));

let refreshing: Promise<string | null> | null = null;
/** Single-flight access-token refresh usable outside the REST client (socket auth errors). */
export function refreshAccessToken(): Promise<string | null> {
  refreshing ??= tokens.refresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export interface Runtime {
  userId: string;
  deviceId: string;
  socket: AppSocket;
  e2ee: E2EE;
  sync: Synchronizer;
  outbox: Outbox;
}

let runtime: Runtime | null = null;
let starting: Promise<Runtime> | null = null;

export function getRuntime(): Runtime | null {
  return runtime;
}

export function requireRuntime(): Runtime {
  if (!runtime) throw new Error('session not started');
  return runtime;
}

function keyServer(): KeyServer {
  return {
    uploadBundle: (upload) => api.keys.uploadBundle(upload).then(() => undefined),
    uploadOneTime: (deviceId, keys) => api.keys.uploadOneTime(deviceId, keys).then(() => undefined),
    fetchBundle: (userId): Promise<PreKeyBundle> => api.keys.bundleFor(userId),
    async countOneTime(deviceId) {
      try {
        return (await api.keys.count(deviceId)).oneTimePreKeys;
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 404) return null;
        throw err;
      }
    },
  };
}

/** Start (idempotently) the runtime for the authenticated user. */
export function startSession(): Promise<Runtime> {
  if (runtime) return Promise.resolve(runtime);
  if (starting) return starting;
  starting = (async () => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('not authenticated');
    const deviceId = await getDeviceId();
    const e2ee = await E2EE.open({ userId: user.id, deviceId, storage: kv, keyServer: keyServer() });

    // Lazy imports break the import cycle runtime -> messaging -> runtime.
    const messaging = await import('./messaging');
    const realtime = await import('./realtime');

    const sync = new Synchronizer({
      pull: (conversationId, afterSeq, limit) => emitWithAck('sync:pull', { conversationId, afterSeq, limit }),
      apply: (conversationId, messages) => messaging.ingestMessages(conversationId, messages),
    });

    const outbox = new Outbox({
      storage: kv,
      userId: user.id,
      send: (input) => emitWithAck('message:send', input).then((r) => r.message),
      encrypt: (item) => messaging.encryptOutboxItem(item),
      onSent: (item, message) => messaging.onOutboxSent(item, message),
      onFailed: (item, error) => messaging.onOutboxFailed(item, error),
      onRetryScheduled: (item) => useMessagesStore.getState().setPendingStatus(item.clientMsgId, 'queued'),
    });

    const socket = connectSocket({ getToken: tokens.getAccessToken, deviceId });
    runtime = { userId: user.id, deviceId, socket, e2ee, sync, outbox };
    realtime.bindRealtime(runtime);
    await messaging.loadConversations();
    void outbox.flush();
    return runtime;
  })().finally(() => {
    starting = null;
  });
  return starting;
}

export async function stopSession(): Promise<void> {
  const r = runtime;
  runtime = null;
  if (r) {
    r.outbox.dispose();
    await r.e2ee.flush().catch(() => undefined);
  }
  disconnectSocket();
  useConversationsStore.getState().reset();
  useMessagesStore.getState().reset();
  usePresenceStore.getState().reset();
  useTypingStore.getState().reset();
  useUsersStore.getState().reset();
  useUiStore.getState().setConnection('offline');
}

export async function logout(): Promise<void> {
  const { refreshToken } = useAuthStore.getState();
  if (refreshToken) await api.auth.logout(refreshToken).catch(() => undefined);
  await stopSession();
  useAuthStore.getState().clear();
}

/** Wipe local key material and republish a fresh identity. Peers must re-establish sessions. */
export async function resetEncryptionKeys(): Promise<void> {
  const r = requireRuntime();
  await r.e2ee.reset();
  const fresh = await E2EE.open({ userId: r.userId, deviceId: r.deviceId, storage: kv, keyServer: keyServer() });
  runtime = { ...r, e2ee: fresh };
}
