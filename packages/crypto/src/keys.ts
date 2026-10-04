import type { OneTimePreKey, PreKeyBundle, PreKeyBundleUpload, SignedPreKey } from '@chatverse/protocol';
import { fromBase64Url, toBase64Url } from './encoding.js';
import { generateDhKeyPair, generateSigningKeyPair, sign, verify, type KeyPair } from './primitives.js';

/**
 * Long-term and medium-term key material for one device.
 *
 * Unlike Signal (which derives an XEdDSA signature from the X25519 identity key) we keep a
 * separate Ed25519 signing key, the same choice made by Matrix/Olm. It costs one extra public
 * key in the bundle but keeps every primitive in its standard, audited form.
 */
export interface DeviceIdentity {
  deviceId: string;
  identity: KeyPair; // X25519
  signing: KeyPair; // Ed25519
}

export interface StoredPreKey {
  id: number;
  keyPair: KeyPair;
}

export interface DeviceKeyStore {
  identity: DeviceIdentity;
  signedPreKey: StoredPreKey;
  oneTimePreKeys: Map<number, StoredPreKey>;
  nextPreKeyId: number;
}

export function createDeviceIdentity(deviceId: string): DeviceIdentity {
  return { deviceId, identity: generateDhKeyPair(), signing: generateSigningKeyPair() };
}

export function createSignedPreKey(identity: DeviceIdentity, id: number): { stored: StoredPreKey; published: SignedPreKey } {
  const keyPair = generateDhKeyPair();
  const signature = sign(keyPair.publicKey, identity.signing.privateKey);
  return {
    stored: { id, keyPair },
    published: { id, publicKey: toBase64Url(keyPair.publicKey), signature: toBase64Url(signature) },
  };
}

export function createOneTimePreKeys(startId: number, count: number): { stored: StoredPreKey[]; published: OneTimePreKey[] } {
  const stored: StoredPreKey[] = [];
  const published: OneTimePreKey[] = [];
  for (let i = 0; i < count; i++) {
    const keyPair = generateDhKeyPair();
    stored.push({ id: startId + i, keyPair });
    published.push({ id: startId + i, publicKey: toBase64Url(keyPair.publicKey) });
  }
  return { stored, published };
}

/** Bootstrap a full key store for a brand-new device. */
export function createDeviceKeyStore(deviceId: string, oneTimePreKeyCount = 20): { store: DeviceKeyStore; upload: PreKeyBundleUpload } {
  const identity = createDeviceIdentity(deviceId);
  const spk = createSignedPreKey(identity, 1);
  const opks = createOneTimePreKeys(2, oneTimePreKeyCount);
  const store: DeviceKeyStore = {
    identity,
    signedPreKey: spk.stored,
    oneTimePreKeys: new Map(opks.stored.map((k) => [k.id, k])),
    nextPreKeyId: 2 + oneTimePreKeyCount,
  };
  const upload: PreKeyBundleUpload = {
    deviceId,
    identityKey: toBase64Url(identity.identity.publicKey),
    signingKey: toBase64Url(identity.signing.publicKey),
    signedPreKey: spk.published,
    oneTimePreKeys: opks.published,
  };
  return { store, upload };
}

/** Top up one-time pre-keys; returns the public halves to upload. */
export function replenishOneTimePreKeys(store: DeviceKeyStore, count: number): OneTimePreKey[] {
  const { stored, published } = createOneTimePreKeys(store.nextPreKeyId, count);
  for (const k of stored) store.oneTimePreKeys.set(k.id, k);
  store.nextPreKeyId += count;
  return published;
}

/** Verify a fetched bundle before trusting any key in it. */
export function verifyPreKeyBundle(bundle: PreKeyBundle): boolean {
  try {
    const signingKey = fromBase64Url(bundle.signingKey);
    const spk = fromBase64Url(bundle.signedPreKey.publicKey);
    const signature = fromBase64Url(bundle.signedPreKey.signature);
    if (signingKey.length !== 32 || spk.length !== 32 || signature.length !== 64) return false;
    if (fromBase64Url(bundle.identityKey).length !== 32) return false;
    return verify(signature, spk, signingKey);
  } catch {
    return false;
  }
}

/**
 * Safety number: a short fingerprint both parties can compare out-of-band to detect a
 * man-in-the-middle at the key server. Symmetric in its arguments.
 */
export function safetyNumber(identityKeyA: Uint8Array, identityKeyB: Uint8Array): string {
  const [first, second] = toBase64Url(identityKeyA) < toBase64Url(identityKeyB) ? [identityKeyA, identityKeyB] : [identityKeyB, identityKeyA];
  const digest = hashToDigits(new Uint8Array([...first, ...second]));
  return digest.match(/.{1,5}/g)!.join(' ');
}

function hashToDigits(input: Uint8Array): string {
  // 60 decimal digits derived from iterated SHA-256 (5200 iterations, as in Signal's fingerprint)
  // keep it cheap here: 1024 iterations is plenty for a human-comparable fingerprint.
  let h = input;
  for (let i = 0; i < 1024; i++) h = sha256Once(h);
  let digits = '';
  for (let i = 0; i < 12; i++) {
    const chunk = ((h[i * 2] as number) << 8) | (h[i * 2 + 1] as number);
    digits += (chunk % 100000).toString().padStart(5, '0');
  }
  return digits;
}

import { sha256 } from '@noble/hashes/sha256';
function sha256Once(b: Uint8Array): Uint8Array {
  return sha256(b);
}
