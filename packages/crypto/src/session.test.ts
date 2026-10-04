import { describe, expect, it } from 'vitest';
import type { PreKeyBundle } from '@chatverse/protocol';
import { fromBase64Url } from './encoding.js';
import { createDeviceKeyStore, replenishOneTimePreKeys, safetyNumber, verifyPreKeyBundle } from './keys.js';
import { PairwiseSession } from './session.js';

function bundleFor(userId: string, store: ReturnType<typeof createDeviceKeyStore>, consumeOpk = true): PreKeyBundle {
  const opk = consumeOpk ? store.upload.oneTimePreKeys[0]! : null;
  return {
    userId,
    deviceId: store.upload.deviceId,
    identityKey: store.upload.identityKey,
    signingKey: store.upload.signingKey,
    signedPreKey: store.upload.signedPreKey,
    oneTimePreKey: opk,
  };
}

describe('PairwiseSession (X3DH + Double Ratchet)', () => {
  it('establishes a session from a bundle and exchanges messages both ways', () => {
    const alice = createDeviceKeyStore('alice-device-1', 5);
    const bob = createDeviceKeyStore('bob-device-01', 5);

    const session = PairwiseSession.initiate(alice.store, bundleFor('bob', bob));
    const first = session.encrypt('hi bob, this is alice');
    expect(first.suite).toBe('x3dh-dr-xchacha20-v1');

    const { session: bobSession, plaintext } = PairwiseSession.respond(bob.store, 'alice-device-1', first);
    expect(plaintext).toBe('hi bob, this is alice');
    // the one-time pre-key was consumed
    expect(bob.store.oneTimePreKeys.has(bob.upload.oneTimePreKeys[0]!.id)).toBe(false);

    const reply = bobSession.encrypt('hi alice');
    expect(session.decrypt(reply)).toBe('hi alice');

    // After the first reply, X3DH parameters are no longer attached.
    const second = session.encrypt('ok');
    expect(JSON.parse(new TextDecoder().decode(fromBase64Url(second.header)))).not.toHaveProperty('x3dh');
    expect(bobSession.decrypt(second)).toBe('ok');
  });

  it('works without a one-time pre-key (bundle exhausted) at reduced forward secrecy', () => {
    const alice = createDeviceKeyStore('alice-device-1', 0);
    const bob = createDeviceKeyStore('bob-device-01', 0);
    const session = PairwiseSession.initiate(alice.store, bundleFor('bob', bob, false));
    const { plaintext } = PairwiseSession.respond(bob.store, 'alice-device-1', session.encrypt('no opk'));
    expect(plaintext).toBe('no opk');
  });

  it('rejects a bundle whose signed pre-key signature does not verify', () => {
    const alice = createDeviceKeyStore('alice-device-1', 1);
    const bob = createDeviceKeyStore('bob-device-01', 1);
    const mallory = createDeviceKeyStore('mallory-dev-1', 1);
    const forged = { ...bundleFor('bob', bob), signedPreKey: mallory.upload.signedPreKey };
    expect(verifyPreKeyBundle(forged)).toBe(false);
    expect(() => PairwiseSession.initiate(alice.store, forged)).toThrow(/signature/);
  });

  it('survives persistence on both sides', () => {
    const alice = createDeviceKeyStore('alice-device-1', 2);
    const bob = createDeviceKeyStore('bob-device-01', 2);
    const a1 = PairwiseSession.initiate(alice.store, bundleFor('bob', bob));
    const { session: b1 } = PairwiseSession.respond(bob.store, 'alice-device-1', a1.encrypt('x'));
    const a2 = PairwiseSession.fromJSON(JSON.parse(JSON.stringify(a1.toJSON())));
    const b2 = PairwiseSession.fromJSON(JSON.parse(JSON.stringify(b1.toJSON())));
    expect(a2.decrypt(b2.encrypt('persisted'))).toBe('persisted');
    expect(b2.decrypt(a2.encrypt('both ways'))).toBe('both ways');
  });

  it('replenishes one-time pre-keys with fresh ids', () => {
    const bob = createDeviceKeyStore('bob-device-01', 3);
    const more = replenishOneTimePreKeys(bob.store, 4);
    expect(more.map((k) => k.id)).toEqual([5, 6, 7, 8]);
    expect(bob.store.oneTimePreKeys.size).toBe(7);
  });

  it('safety numbers are symmetric and differ per key pair', () => {
    const a = createDeviceKeyStore('alice-device-1', 0);
    const b = createDeviceKeyStore('bob-device-01', 0);
    const c = createDeviceKeyStore('carol-device-1', 0);
    const ab = safetyNumber(a.store.identity.identity.publicKey, b.store.identity.identity.publicKey);
    const ba = safetyNumber(b.store.identity.identity.publicKey, a.store.identity.identity.publicKey);
    const ac = safetyNumber(a.store.identity.identity.publicKey, c.store.identity.identity.publicKey);
    expect(ab).toBe(ba);
    expect(ab).not.toBe(ac);
    expect(ab.replace(/ /g, '')).toHaveLength(60);
  });
});
