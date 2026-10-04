import { useConversationsStore } from '@/stores/conversations';
import { getRuntime } from './session';

/**
 * Receipt watermarks.
 *
 * `delivered` is emitted for every message we receive, debounced to the highest seq per
 * conversation (the server stores a watermark, so only the maximum matters). `read` is emitted
 * only while the conversation is on screen in a visible, focused window; otherwise the intent is
 * parked and replayed when the tab becomes visible again.
 */

const DELIVERED_DEBOUNCE_MS = 300;

const deliveredPending = new Map<string, number>();
let deliveredTimer: ReturnType<typeof setTimeout> | null = null;
const deliveredSent = new Map<string, number>();

export function noteDelivered(conversationId: string, seq: number): void {
  if ((deliveredSent.get(conversationId) ?? 0) >= seq) return;
  deliveredPending.set(conversationId, Math.max(seq, deliveredPending.get(conversationId) ?? 0));
  if (deliveredTimer) return;
  deliveredTimer = setTimeout(() => {
    deliveredTimer = null;
    const socket = getRuntime()?.socket;
    if (!socket?.connected) return; // the server's sync pull will re-derive delivery on reconnect
    for (const [cid, s] of deliveredPending) {
      socket.emit('receipt:delivered', { conversationId: cid, seq: s });
      deliveredSent.set(cid, s);
    }
    deliveredPending.clear();
  }, DELIVERED_DEBOUNCE_MS);
}

const readPending = new Map<string, number>();
const readSent = new Map<string, number>();

function windowIsActive(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus();
}

function flushRead(): void {
  const r = getRuntime();
  if (!r?.socket.connected || !windowIsActive()) return;
  for (const [cid, seq] of readPending) {
    if ((readSent.get(cid) ?? 0) >= seq) continue;
    r.socket.emit('receipt:read', { conversationId: cid, seq });
    readSent.set(cid, seq);
    useConversationsStore.getState().setLocalRead(cid, r.userId, seq);
  }
  readPending.clear();
}

/** Mark everything up to `seq` as read once the user can actually see it. */
export function noteRead(conversationId: string, seq: number): void {
  if (seq <= 0) return;
  if ((readSent.get(conversationId) ?? 0) >= seq) return;
  readPending.set(conversationId, Math.max(seq, readPending.get(conversationId) ?? 0));
  flushRead();
}

/** Forget sent watermarks (e.g. after a reconnect the server state is authoritative again). */
export function resetReceiptState(): void {
  deliveredSent.clear();
  readSent.clear();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', flushRead);
  window.addEventListener('focus', flushRead);
}
