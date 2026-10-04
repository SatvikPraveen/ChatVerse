import {
  createDeviceKeyStore,
  fromBase64Url,
  toBase64Url,
  type DeviceKeyStore,
  type StoredPreKey,
} from '@chatverse/crypto';
import type { PreKeyBundleUpload } from '@chatverse/protocol';

/**
 * Serialisation of the device key store. Private keys are stored as base64url strings inside
 * IndexedDB and never leave the device; the server only ever receives `toUpload()` (public
 * halves + the signed pre-key signature).
 */

export interface SerializedKeyStore {
  v: 1;
  deviceId: string;
  identity: { pub: string; priv: string };
  signing: { pub: string; priv: string };
  signedPreKey: { id: number; pub: string; priv: string; signature: string };
  oneTimePreKeys: Array<{ id: number; pub: string; priv: string }>;
  nextPreKeyId: number;
}

export interface DeviceKeys {
  store: DeviceKeyStore;
  /** Signature over the signed pre-key, kept so the bundle can be re-published after a reload. */
  signedPreKeySignature: string;
}

export const DEFAULT_ONE_TIME_PREKEYS = 50;
export const MIN_ONE_TIME_PREKEYS = 10;

export function generateDeviceKeys(deviceId: string, oneTimeCount = DEFAULT_ONE_TIME_PREKEYS): { keys: DeviceKeys; upload: PreKeyBundleUpload } {
  const { store, upload } = createDeviceKeyStore(deviceId, oneTimeCount);
  return { keys: { store, signedPreKeySignature: upload.signedPreKey.signature }, upload };
}

function serializePreKey(k: StoredPreKey): { id: number; pub: string; priv: string } {
  return { id: k.id, pub: toBase64Url(k.keyPair.publicKey), priv: toBase64Url(k.keyPair.privateKey) };
}

function deserializePreKey(k: { id: number; pub: string; priv: string }): StoredPreKey {
  return { id: k.id, keyPair: { publicKey: fromBase64Url(k.pub), privateKey: fromBase64Url(k.priv) } };
}

export function serializeKeys(keys: DeviceKeys): SerializedKeyStore {
  const { store } = keys;
  return {
    v: 1,
    deviceId: store.identity.deviceId,
    identity: { pub: toBase64Url(store.identity.identity.publicKey), priv: toBase64Url(store.identity.identity.privateKey) },
    signing: { pub: toBase64Url(store.identity.signing.publicKey), priv: toBase64Url(store.identity.signing.privateKey) },
    signedPreKey: { ...serializePreKey(store.signedPreKey), signature: keys.signedPreKeySignature },
    oneTimePreKeys: [...store.oneTimePreKeys.values()].map(serializePreKey),
    nextPreKeyId: store.nextPreKeyId,
  };
}

export function deserializeKeys(json: SerializedKeyStore): DeviceKeys {
  const store: DeviceKeyStore = {
    identity: {
      deviceId: json.deviceId,
      identity: { publicKey: fromBase64Url(json.identity.pub), privateKey: fromBase64Url(json.identity.priv) },
      signing: { publicKey: fromBase64Url(json.signing.pub), privateKey: fromBase64Url(json.signing.priv) },
    },
    signedPreKey: deserializePreKey(json.signedPreKey),
    oneTimePreKeys: new Map(json.oneTimePreKeys.map((k) => [k.id, deserializePreKey(k)])),
    nextPreKeyId: json.nextPreKeyId,
  };
  return { store, signedPreKeySignature: json.signedPreKey.signature };
}

/** Rebuild the public bundle from local state (used when the server has forgotten this device). */
export function toUpload(keys: DeviceKeys): PreKeyBundleUpload {
  const { store } = keys;
  return {
    deviceId: store.identity.deviceId,
    identityKey: toBase64Url(store.identity.identity.publicKey),
    signingKey: toBase64Url(store.identity.signing.publicKey),
    signedPreKey: {
      id: store.signedPreKey.id,
      publicKey: toBase64Url(store.signedPreKey.keyPair.publicKey),
      signature: keys.signedPreKeySignature,
    },
    oneTimePreKeys: [...store.oneTimePreKeys.values()].map((k) => ({ id: k.id, publicKey: toBase64Url(k.keyPair.publicKey) })),
  };
}
