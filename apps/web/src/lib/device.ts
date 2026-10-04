import { kv, type KeyValueStore } from './storage';

const DEVICE_KEY = 'cv:device-id';

function randomDeviceId(): string {
  // 24 URL-safe characters (satisfies deviceIdSchema: 8-64 of [A-Za-z0-9_-]).
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * A stable identifier for this browser profile. It names the E2EE device: pre-key bundles
 * are published per device and incoming envelopes are addressed to it.
 */
export async function getDeviceId(store: KeyValueStore = kv): Promise<string> {
  const existing = await store.get<string>(DEVICE_KEY);
  if (existing) return existing;
  const id = randomDeviceId();
  await store.set(DEVICE_KEY, id);
  return id;
}

/** Forget the device identity (used by "Reset encryption keys"). */
export async function resetDeviceId(store: KeyValueStore = kv): Promise<string> {
  await store.del(DEVICE_KEY);
  return getDeviceId(store);
}
