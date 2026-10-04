import type { PreKeyBundle } from '@chatverse/protocol';
import { concatBytes, fromBase64Url } from './encoding.js';
import { verifyPreKeyBundle, type DeviceKeyStore } from './keys.js';
import { dh, generateDhKeyPair, kdf, KEY_LEN } from './primitives.js';

/**
 * Extended Triple Diffie-Hellman (X3DH), Marlinspike & Perrin 2016.
 *
 *   DH1 = DH(IK_A, SPK_B)
 *   DH2 = DH(EK_A, IK_B)
 *   DH3 = DH(EK_A, SPK_B)
 *   DH4 = DH(EK_A, OPK_B)         (only when a one-time pre-key was available)
 *   SK  = HKDF(F || DH1 || DH2 || DH3 [|| DH4])
 *   AD  = IK_A || IK_B
 *
 * DH1 authenticates Alice (only the holder of IK_A can compute it), DH2 authenticates Bob,
 * DH3 provides forward secrecy from Alice's ephemeral key, DH4 adds forward secrecy even if
 * Bob's signed pre-key is later compromised.
 */

const F = new Uint8Array(KEY_LEN).fill(0xff);
const INFO = 'ChatVerse-X3DH-v1';

export interface X3dhInitiatorResult {
  sharedSecret: Uint8Array;
  /** Associated data bound into every message of the resulting session. */
  associatedData: Uint8Array;
  /** Values Bob needs to run the responder side. */
  initialMessage: { identityKey: Uint8Array; ephemeralKey: Uint8Array; signedPreKeyId: number; oneTimePreKeyId: number | null };
  /** Bob's ratchet public key for initialising the Double Ratchet. */
  theirRatchetKey: Uint8Array;
}

export function x3dhInitiate(ours: DeviceKeyStore, bundle: PreKeyBundle): X3dhInitiatorResult {
  if (!verifyPreKeyBundle(bundle)) throw new Error('pre-key bundle signature invalid');
  const ikB = fromBase64Url(bundle.identityKey);
  const spkB = fromBase64Url(bundle.signedPreKey.publicKey);
  const opkB = bundle.oneTimePreKey ? fromBase64Url(bundle.oneTimePreKey.publicKey) : null;
  const ek = generateDhKeyPair();

  const dh1 = dh(ours.identity.identity.privateKey, spkB);
  const dh2 = dh(ek.privateKey, ikB);
  const dh3 = dh(ek.privateKey, spkB);
  const parts = [F, dh1, dh2, dh3];
  if (opkB) parts.push(dh(ek.privateKey, opkB));

  const sharedSecret = kdf(concatBytes(...parts), new Uint8Array(KEY_LEN), INFO, KEY_LEN);
  wipe(dh1, dh2, dh3);
  return {
    sharedSecret,
    associatedData: concatBytes(ours.identity.identity.publicKey, ikB),
    initialMessage: {
      identityKey: ours.identity.identity.publicKey,
      ephemeralKey: ek.publicKey,
      signedPreKeyId: bundle.signedPreKey.id,
      oneTimePreKeyId: bundle.oneTimePreKey?.id ?? null,
    },
    theirRatchetKey: spkB,
  };
}

export interface X3dhResponderResult {
  sharedSecret: Uint8Array;
  associatedData: Uint8Array;
}

export function x3dhRespond(
  ours: DeviceKeyStore,
  initial: X3dhInitiatorResult['initialMessage'],
): X3dhResponderResult {
  if (initial.signedPreKeyId !== ours.signedPreKey.id) throw new Error('unknown signed pre-key id');
  const spk = ours.signedPreKey.keyPair;
  let opk = null;
  if (initial.oneTimePreKeyId !== null) {
    opk = ours.oneTimePreKeys.get(initial.oneTimePreKeyId);
    if (!opk) throw new Error('one-time pre-key already consumed or unknown');
    // One-time pre-keys are single use by construction.
    ours.oneTimePreKeys.delete(initial.oneTimePreKeyId);
  }

  const dh1 = dh(spk.privateKey, initial.identityKey);
  const dh2 = dh(ours.identity.identity.privateKey, initial.ephemeralKey);
  const dh3 = dh(spk.privateKey, initial.ephemeralKey);
  const parts = [F, dh1, dh2, dh3];
  if (opk) parts.push(dh(opk.keyPair.privateKey, initial.ephemeralKey));

  const sharedSecret = kdf(concatBytes(...parts), new Uint8Array(KEY_LEN), INFO, KEY_LEN);
  wipe(dh1, dh2, dh3);
  return { sharedSecret, associatedData: concatBytes(initial.identityKey, ours.identity.identity.publicKey) };
}

function wipe(...buffers: Uint8Array[]): void {
  for (const b of buffers) b.fill(0);
}
