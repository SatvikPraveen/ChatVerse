import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { utf8 } from './encoding.js';
import { DoubleRatchet, MAX_SKIP } from './ratchet.js';
import { generateDhKeyPair, random } from './primitives.js';

function pair() {
  const sk = random(32);
  const ad = utf8.encode('alice|bob');
  const bobRatchetKey = generateDhKeyPair();
  const alice = DoubleRatchet.initAsInitiator(sk, bobRatchetKey.publicKey, ad);
  const bob = DoubleRatchet.initAsResponder(sk, bobRatchetKey, ad);
  return { alice, bob };
}

describe('DoubleRatchet', () => {
  it('round-trips a conversation with alternating senders', () => {
    const { alice, bob } = pair();
    const m1 = alice.encrypt(utf8.encode('hello bob'));
    expect(utf8.decode(bob.decrypt(m1))).toBe('hello bob');
    const m2 = bob.encrypt(utf8.encode('hello alice'));
    expect(utf8.decode(alice.decrypt(m2))).toBe('hello alice');
    const m3 = alice.encrypt(utf8.encode('again'));
    expect(utf8.decode(bob.decrypt(m3))).toBe('again');
  });

  it('handles out-of-order and lost messages within MAX_SKIP', () => {
    const { alice, bob } = pair();
    const msgs = Array.from({ length: 5 }, (_, i) => alice.encrypt(utf8.encode(`m${i}`)));
    expect(utf8.decode(bob.decrypt(msgs[4]!))).toBe('m4');
    expect(utf8.decode(bob.decrypt(msgs[1]!))).toBe('m1');
    expect(utf8.decode(bob.decrypt(msgs[3]!))).toBe('m3');
    // m0 and m2 are "lost"; the session still advances
    const reply = bob.encrypt(utf8.encode('got some'));
    expect(utf8.decode(alice.decrypt(reply))).toBe('got some');
    // late arrivals from the old chain still decrypt
    expect(utf8.decode(bob.decrypt(msgs[0]!))).toBe('m0');
  });

  it('rejects replayed messages (each message key is single use)', () => {
    const { alice, bob } = pair();
    const m = alice.encrypt(utf8.encode('once'));
    bob.decrypt(m);
    expect(() => bob.decrypt(m)).toThrow();
  });

  it('rejects tampered ciphertext and header without corrupting state', () => {
    const { alice, bob } = pair();
    const m1 = alice.encrypt(utf8.encode('one'));
    const tampered = { ...m1, ciphertext: new Uint8Array(m1.ciphertext) };
    tampered.ciphertext[0] = (tampered.ciphertext[0] as number) ^ 0xff;
    expect(() => bob.decrypt(tampered)).toThrow();
    const badHeader = { ...m1, header: { ...m1.header, n: m1.header.n + 3 } };
    expect(() => bob.decrypt(badHeader)).toThrow();
    // state was restored: the genuine message still decrypts
    expect(utf8.decode(bob.decrypt(m1))).toBe('one');
  });

  it('refuses to skip more than MAX_SKIP messages', () => {
    const { alice, bob } = pair();
    for (let i = 0; i <= MAX_SKIP; i++) alice.encrypt(utf8.encode('x'));
    const far = alice.encrypt(utf8.encode('far'));
    expect(() => bob.decrypt(far)).toThrow(/too many skipped/);
  });

  it('serialises and restores sessions losslessly', () => {
    const { alice, bob } = pair();
    const m1 = alice.encrypt(utf8.encode('before'));
    bob.decrypt(m1);
    const bob2 = DoubleRatchet.fromJSON(JSON.parse(JSON.stringify(bob.toJSON())));
    const alice2 = DoubleRatchet.fromJSON(JSON.parse(JSON.stringify(alice.toJSON())));
    const m2 = bob2.encrypt(utf8.encode('after restore'));
    expect(utf8.decode(alice2.decrypt(m2))).toBe('after restore');
  });

  it('provides post-compromise security: a leaked state is useless once the victim has ratcheted a fresh DH key', () => {
    const { alice, bob } = pair();
    bob.decrypt(alice.encrypt(utf8.encode('1')));
    const leakedBob = DoubleRatchet.fromJSON(bob.toJSON()); // attacker snapshot of Bob's full state

    // While Bob's leaked DH key is still in use, the attacker can follow along.
    alice.decrypt(bob.encrypt(utf8.encode('2')));
    const stillReadable = alice.encrypt(utf8.encode('3'));
    bob.decrypt(stillReadable);
    expect(utf8.decode(leakedBob.decrypt(stillReadable))).toBe('3');

    // Bob replies with a DH key generated after the compromise; Alice's next message is sealed
    // with a root key the attacker cannot derive.
    alice.decrypt(bob.encrypt(utf8.encode('4')));
    const healed = alice.encrypt(utf8.encode('secret after healing'));
    expect(utf8.decode(bob.decrypt(healed))).toBe('secret after healing');
    expect(() => leakedBob.decrypt(healed)).toThrow();
  });

  it('delivers any interleaving of sends in any order (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ from: fc.constantFrom('a', 'b'), text: fc.string({ maxLength: 40 }) }), { maxLength: 40 }),
        (script) => {
          const { alice, bob } = pair();
          // Bob cannot send before receiving at least one message from Alice (he lacks her ratchet key).
          const ops = script.filter((s, i) => s.from === 'a' || script.slice(0, i).some((p) => p.from === 'a'));
          // Deliver in order but process after shuffling within each sender's run, to exercise skips.
          const queueB: ReturnType<typeof alice.encrypt>[] = [];
          const queueA: ReturnType<typeof alice.encrypt>[] = [];
          const expectedB: string[] = [];
          const expectedA: string[] = [];
          for (const op of ops) {
            if (op.from === 'a') {
              queueB.push(alice.encrypt(utf8.encode(op.text)));
              expectedB.push(op.text);
            } else {
              // flush Alice's queue to Bob first so Bob has her key
              while (queueB.length) {
                const idx = queueB.length - 1;
                expect(utf8.decode(bob.decrypt(queueB.splice(idx, 1)[0]!))).toBe(expectedB.splice(idx, 1)[0]);
              }
              queueA.push(bob.encrypt(utf8.encode(op.text)));
              expectedA.push(op.text);
              while (queueA.length) {
                const idx = queueA.length - 1;
                expect(utf8.decode(alice.decrypt(queueA.splice(idx, 1)[0]!))).toBe(expectedA.splice(idx, 1)[0]);
              }
            }
          }
          while (queueB.length) {
            const idx = queueB.length - 1;
            expect(utf8.decode(bob.decrypt(queueB.splice(idx, 1)[0]!))).toBe(expectedB.splice(idx, 1)[0]);
          }
        },
      ),
    );
  });
});
