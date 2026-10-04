import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'system';
export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export interface Toast {
  id: number;
  kind: 'info' | 'error' | 'success';
  message: string;
}

interface UiState {
  theme: Theme;
  connection: ConnectionState;
  sidebarOpen: boolean;
  infoPanelOpen: boolean;
  toasts: Toast[];
  /** Message being replied to / edited in the composer, per conversation. */
  replyTo: Record<string, string | null>;
  editing: Record<string, string | null>;
  setTheme(theme: Theme): void;
  setConnection(state: ConnectionState): void;
  setSidebarOpen(open: boolean): void;
  setInfoPanelOpen(open: boolean): void;
  toast(kind: Toast['kind'], message: string): void;
  dismissToast(id: number): void;
  setReplyTo(conversationId: string, messageId: string | null): void;
  setEditing(conversationId: string, messageId: string | null): void;
}

const THEME_KEY = 'cv:theme';

function loadTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(theme: Theme): void {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

let toastSeq = 0;

export const useUiStore = create<UiState>((set) => ({
  theme: loadTheme(),
  connection: 'connecting',
  sidebarOpen: true,
  infoPanelOpen: false,
  toasts: [],
  replyTo: {},
  editing: {},

  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
    applyTheme(theme);
    set({ theme });
  },
  setConnection: (connection) => set({ connection }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setInfoPanelOpen: (infoPanelOpen) => set({ infoPanelOpen }),
  toast: (kind, message) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }].slice(-5) }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 5_000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setReplyTo: (conversationId, messageId) => set((s) => ({ replyTo: { ...s.replyTo, [conversationId]: messageId } })),
  setEditing: (conversationId, messageId) => set((s) => ({ editing: { ...s.editing, [conversationId]: messageId } })),
}));
