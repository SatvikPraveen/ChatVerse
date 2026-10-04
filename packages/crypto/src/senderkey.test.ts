import { describe, expect, it } from 'vitest';
import { utf8 } from './encoding.js';
import { decodeGroup, encodeGroup } from './envelope.js';
import { SenderKeyState, SENDER_KEY_MAX_SKIP } from './senderkey.js';

describe('SenderKeyState', () => {
  it('lets every member decrypt a single encryption', () => {
    const alice = SenderKeyState.create();
    const bob = SenderKeyState.fromDistribution(alice.distribution());
    const carol = SenderKeyState.fromDistribution(alice.distribution());
    const msg = alice.encrypt(utf8.encode('group hello'));
    expect(utf8.decode(bob.decrypt(msg))).toBe('group hello');
    expect(utf8.decode(carol.decrypt(msg))).toBe('group hello');
  });

  it('tolerates reordering and loss, and rejects replays', () => {
    const alice = SenderKeyState.create();
    const bob = SenderKeyState.fromDistribution(alice.distribution());
    const m = Array.from({ length: 4 }, (_, i) => alice.encrypt(utf8.encode(`m${i}`)));
    expect(utf8.decode(bob.decrypt(m[3]!))).toBe('m3');
    expect(utf8.decode(bob.decrypt(m[1]!))).toBe('m1');
    expect(() => bob.decrypt(m[1]!)).toThrow(/replay/);
    expect(utf8.decode(bob.decrypt(m[0]!))).toBe('m0');
  });

  it('imported keys cannot encrypt (no signing key) and forged signatures are rejected', () => {
    const alice = SenderKeyState.create();
    const bob = SenderKeyState.fromDistribution(alice.distribution());
    expect(() => bob.encrypt(utf8.encode('x'))).toThrow();
    const msg = alice.encrypt(utf8.encode('signed'));
    const forged = { ...msg, ciphertext: new Uint8Array(msg.ciphertext) };
    forged.ciphertext[0] = (forged.ciphertext[0] as number) ^ 1;
    expect(() => bob.decrypt(forged)).toThrow(/signature/);
  });

  it('bounds how far ahead a receiver will ratchet', () => {
    const alice = SenderKeyState.create();
    const bob = SenderKeyState.fromDistribution(alice.distribution());
    for (let i = 0; i <= SENDER_KEY_MAX_SKIP; i++) alice.encrypt(utf8.encode('x'));
    expect(() => bob.decrypt(alice.encrypt(utf8.encode('far')))).toThrow(/too many/);
  });

  it('round-trips through the wire envelope and persistence', () => {
    const alice = SenderKeyState.create();
    const bob = SenderKeyState.fromJSON(JSON.parse(JSON.stringify(SenderKeyState.fromDistribution(alice.distribution()).toJSON())));
    const payload = encodeGroup(alice.encrypt(utf8.encode('via envelope')));
    expect(payload.suite).toBe('senderkey-xchacha20-v1');
    expect(utf8.decode(bob.decrypt(decodeGroup(payload)))).toBe('via envelope');
  });
});
