import type { PublicUser } from '@chatverse/protocol';
import { create } from 'zustand';

/** Cache of other users' public profiles, filled lazily as conversations reference them. */
interface UsersState {
  byId: Record<string, PublicUser>;
  upsert(user: PublicUser): void;
  upsertMany(users: PublicUser[]): void;
  reset(): void;
}

export const useUsersStore = create<UsersState>((set) => ({
  byId: {},
  upsert: (user) => set((s) => ({ byId: { ...s.byId, [user.id]: user } })),
  upsertMany: (users) =>
    set((s) => {
      const byId = { ...s.byId };
      for (const u of users) byId[u.id] = u;
      return { byId };
    }),
  reset: () => set({ byId: {} }),
}));

export function displayNameOf(users: Record<string, PublicUser>, userId: string): string {
  return users[userId]?.displayName ?? users[userId]?.username ?? 'Unknown';
}
