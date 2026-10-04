import type { Conversation } from '@chatverse/protocol';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { loadOlder } from '@/lib/messaging';
import { noteRead } from '@/lib/receipts';
import { sameDay } from '@/lib/time';
import { useMessagesStore } from '@/stores/messages';
import { Spinner } from '../ui/Spinner';
import { MessageItem } from './MessageItem';
import { PendingItem } from './PendingItem';

/** How many of the newest messages to render; older ones are revealed by scrolling up. */
const WINDOW = 150;
const WINDOW_STEP = 100;

export function MessageList({ conversation, myUserId }: { conversation: Conversation; myUserId: string }) {
  const state = useMessagesStore((s) => s.conversations[conversation.id]);
  const decrypt = useMessagesStore((s) => s.decrypt);
  const pendingAll = useMessagesStore((s) => s.pending);
  const scroller = useRef<HTMLDivElement>(null);
  const [windowSize, setWindowSize] = useState(WINDOW);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const stickToBottom = useRef(true);
  const prevHeight = useRef(0);

  const messages = useMemo(() => {
    if (!state) return [];
    const all = state.order.map((id) => state.byId[id]!).filter((m) => decrypt[m.id] !== 'hidden');
    return all.slice(Math.max(0, all.length - windowSize));
  }, [state, decrypt, windowSize]);

  const pending = useMemo(
    () => Object.values(pendingAll).filter((p) => p.conversationId === conversation.id).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)),
    [pendingAll, conversation.id],
  );

  const lastSeq = messages.length > 0 ? messages[messages.length - 1]!.seq : 0;
  const hiddenOlder = (state?.order.length ?? 0) > windowSize;
  const canLoadOlder = hiddenOlder || (state?.hasOlder ?? false);

  // Keep the viewport pinned to the newest message unless the user scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    } else if (prevHeight.current && el.scrollHeight > prevHeight.current) {
      // Older messages were prepended: preserve the visual position.
      el.scrollTop += el.scrollHeight - prevHeight.current;
    }
    prevHeight.current = el.scrollHeight;
  }, [messages, pending]);

  // Read receipts: the newest visible message counts as read while the list is on screen.
  useEffect(() => {
    if (lastSeq > 0) noteRead(conversation.id, lastSeq);
  }, [conversation.id, lastSeq]);

  async function revealOlder() {
    const el = scroller.current;
    if (el) prevHeight.current = el.scrollHeight;
    stickToBottom.current = false;
    if (hiddenOlder) {
      setWindowSize((w) => w + WINDOW_STEP);
      return;
    }
    setLoadingOlder(true);
    try {
      await loadOlder(conversation.id);
    } finally {
      setLoadingOlder(false);
    }
  }

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (el.scrollTop < 80 && canLoadOlder && !loadingOlder) void revealOlder();
  }

  if (!state?.loaded) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div ref={scroller} onScroll={onScroll} className="scrollbar-thin flex-1 overflow-y-auto py-3">
      {canLoadOlder && (
        <div className="flex justify-center pb-2">
          <button type="button" className="btn-ghost text-xs" onClick={() => void revealOlder()} disabled={loadingOlder}>
            {loadingOlder ? 'Loading…' : 'Load older messages'}
          </button>
        </div>
      )}
      <ol className="space-y-1.5">
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || !sameDay(prev.createdAt, m.createdAt);
          const showSender = newDay || !prev || prev.senderId !== m.senderId;
          return (
            <div key={m.id}>
              {newDay && (
                <li className="my-2 text-center text-[11px] uppercase tracking-wide text-muted" aria-label="Date">
                  {new Date(m.createdAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                </li>
              )}
              <MessageItem message={m} conversation={conversation} myUserId={myUserId} showSender={showSender} />
            </div>
          );
        })}
        {pending.map((p) => (
          <PendingItem key={p.clientMsgId} pending={p} />
        ))}
      </ol>
    </div>
  );
}
