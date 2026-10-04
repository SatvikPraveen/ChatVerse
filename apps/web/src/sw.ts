/// <reference lib="webworker" />

/**
 * Service worker: precaches the built app shell (manifest injected by vite-plugin-pwa), serves
 * navigations from cache when offline, and surfaces Web Push notifications.
 */
declare global {
  interface WorkerGlobalScope {
    /** Injected by vite-plugin-pwa (workbox injectManifest) at build time. */
    __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
  }
}
export {};

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = 'chatverse-shell-v1';
// Must stay a literal `self.__WB_MANIFEST` reference so workbox can find the injection point.
const precacheUrls = self.__WB_MANIFEST.map((e) => e.url);

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(precacheUrls))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;

  if (request.mode === 'navigate') {
    // App shell: network first, fall back to the cached index for offline launches.
    event.respondWith(fetch(request).catch(() => caches.match('/index.html').then((r) => r ?? Response.error())));
    return;
  }
  if (url.origin === sw.location.origin) {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
  }
});

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

sw.addEventListener('push', (event) => {
  let payload: PushPayload = {};
  try {
    payload = (event.data?.json() as PushPayload | null) ?? {};
  } catch {
    payload = { body: event.data?.text() };
  }
  const options: NotificationOptions = {
    body: payload.body ?? 'New message',
    icon: '/icon-192.svg',
    badge: '/favicon.svg',
    tag: payload.tag ?? 'chatverse',
    data: { url: payload.url ?? '/app' },
  };
  event.waitUntil(sw.registration.showNotification(payload.title ?? 'ChatVerse', options));
});

sw.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data as { url?: string } | undefined)?.url ?? '/app';
  event.waitUntil(
    sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const existing = list[0];
      if (existing) {
        existing.navigate(target).catch(() => undefined);
        return existing.focus();
      }
      return sw.clients.openWindow(target);
    }),
  );
});
