/** Runtime configuration resolved from Vite env with sensible development defaults. */
export const env = {
  /** Origin of the API server; REST lives under /api/v1 and Socket.IO at the root. */
  apiUrl: (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, ''),
  vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '',
} as const;

export const API_BASE = `${env.apiUrl}/api/v1`;
