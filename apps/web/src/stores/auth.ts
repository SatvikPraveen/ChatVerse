import type { AuthResponse, UserProfile } from '@chatverse/protocol';
import { create } from 'zustand';

/**
 * Authentication state. Tokens are persisted in localStorage so that a reload resumes the
 * session; the refresh token is rotated by the server on every refresh.
 */

const STORAGE_KEY = 'cv:auth';

interface PersistedAuth {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

function loadPersisted(): PersistedAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedAuth) : null;
  } catch {
    return null;
  }
}

function persist(value: PersistedAuth | null): void {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage may be unavailable (private mode); the session is then memory-only */
  }
}

export type AuthStatus = 'anonymous' | 'authenticated';

interface AuthState {
  status: AuthStatus;
  user: UserProfile | null;
  accessToken: string | null;
  refreshToken: string | null;
  setSession(auth: AuthResponse): void;
  setUser(user: UserProfile): void;
  clear(): void;
}

const initial = loadPersisted();

export const useAuthStore = create<AuthState>((set) => ({
  status: initial ? 'authenticated' : 'anonymous',
  user: initial?.user ?? null,
  accessToken: initial?.accessToken ?? null,
  refreshToken: initial?.refreshToken ?? null,

  setSession: (auth) => {
    persist({ accessToken: auth.accessToken, refreshToken: auth.refreshToken, user: auth.user });
    set({
      status: 'authenticated',
      user: auth.user,
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
    });
  },

  setUser: (user) =>
    set((s) => {
      if (s.accessToken && s.refreshToken)
        persist({ accessToken: s.accessToken, refreshToken: s.refreshToken, user });
      return { user };
    }),

  clear: () => {
    persist(null);
    set({ status: 'anonymous', user: null, accessToken: null, refreshToken: null });
  },
}));
