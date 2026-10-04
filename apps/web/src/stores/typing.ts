import { create } from 'zustand';

/** Typing indicators auto-expire: a lost `isTyping: false` must never leave a ghost indicator. */
export const TYPING_TTL_MS = 4_000;

interface TypingState {
  /** conversationId -> userId -> expiry timestamp (ms) */
  byConversation: Record<string, Record<string, number>>;
  set(conversationId: string, userId: string, isTyping: boolean, now?: number): void;
  sweep(now?: number): void;
  reset(): void;
}

export const useTypingStore = create<TypingState>((set) => ({
  byConversation: {},

  set: (conversationId, userId, isTyping, now = Date.now()) =>
    set((s) => {
      const conv = { ...(s.byConversation[conversationId] ?? {}) };
      if (isTyping) conv[userId] = now + TYPING_TTL_MS;
      else delete conv[userId];
      return { byConversation: { ...s.byConversation, [conversationId]: conv } };
    }),

  sweep: (now = Date.now()) =>
    set((s) => {
      let changed = false;
      const byConversation: TypingState['byConversation'] = {};
      for (const [cid, users] of Object.entries(s.byConversation)) {
        const kept: Record<string, number> = {};
        for (const [uid, exp] of Object.entries(users)) {
          if (exp > now) kept[uid] = exp;
          else changed = true;
        }
        byConversation[cid] = kept;
      }
      return changed ? { byConversation } : s;
    }),

  reset: () => set({ byConversation: {} }),
}));

export function typingUserIds(
  byConversation: TypingState['byConversation'],
  conversationId: string,
  now = Date.now(),
): string[] {
  return Object.entries(byConversation[conversationId] ?? {})
    .filter(([, exp]) => exp > now)
    .map(([uid]) => uid);
}
