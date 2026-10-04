import type { Presence } from '@chatverse/protocol';
import { create } from 'zustand';

interface PresenceState {
  byUserId: Record<string, Presence>;
  set(presence: Presence): void;
  setMany(list: Presence[]): void;
  reset(): void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  byUserId: {},
  set: (presence) => set((s) => ({ byUserId: { ...s.byUserId, [presence.userId]: presence } })),
  setMany: (list) =>
    set((s) => {
      const byUserId = { ...s.byUserId };
      for (const p of list) byUserId[p.userId] = p;
      return { byUserId };
    }),
  reset: () => set({ byUserId: {} }),
}));
