import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { HybridLogicalClock, HlcDriftError, compareHlc, decodeHlc, encodeHlc } from './hlc.js';

describe('HybridLogicalClock', () => {
  it('encodes and decodes losslessly', () => {
    const ts = { wallMs: 1_700_000_000_000, counter: 42, nodeId: 'node-a' };
    expect(decodeHlc(encodeHlc(ts))).toEqual(ts);
  });

  it('produces strictly increasing timestamps even when the wall clock is frozen', () => {
    let now = 1_000;
    const clock = new HybridLogicalClock('a', () => now);
    const a = clock.tick();
    const b = clock.tick();
    now = 999; // clock went backwards
    const c = clock.tick();
    expect(compareHlc(a, b)).toBe(-1);
    expect(compareHlc(b, c)).toBe(-1);
  });

  it('respects causality across nodes with skewed clocks', () => {
    const a = new HybridLogicalClock('a', () => 10_000); // fast clock
    const b = new HybridLogicalClock('b', () => 1_000); // slow clock
    const sent = a.tick();
    const received = b.receive(sent);
    const next = b.tick();
    expect(compareHlc(sent, received)).toBe(-1);
    expect(compareHlc(received, next)).toBe(-1);
    // b has adopted a's wall time rather than its own slow clock
    expect(decodeHlc(next).wallMs).toBe(10_000);
  });

  it('rejects remote timestamps too far in the future', () => {
    const a = new HybridLogicalClock('a', () => 10_000_000);
    const b = new HybridLogicalClock('b', () => 1_000);
    expect(() => b.receive(a.tick())).toThrow(HlcDriftError);
  });

  it('is a total order: lexicographic order equals (wall, counter, node) order (property)', () => {
    fc.assert(
      fc.property(
        fc.record({ wallMs: fc.nat(2 ** 45), counter: fc.nat(1000), nodeId: fc.constantFrom('a', 'b', 'c') }),
        fc.record({ wallMs: fc.nat(2 ** 45), counter: fc.nat(1000), nodeId: fc.constantFrom('a', 'b', 'c') }),
        (x, y) => {
          const expected =
            x.wallMs !== y.wallMs
              ? Math.sign(x.wallMs - y.wallMs)
              : x.counter !== y.counter
                ? Math.sign(x.counter - y.counter)
                : x.nodeId < y.nodeId
                  ? -1
                  : x.nodeId > y.nodeId
                    ? 1
                    : 0;
          expect(compareHlc(encodeHlc(x), encodeHlc(y))).toBe(expected);
        },
      ),
    );
  });

  it('every receive() result is greater than its input and the previous local tick (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.nat(5_000), { minLength: 1, maxLength: 200 }), (deltas) => {
        let nowA = 1_000_000;
        let nowB = 1_000_000;
        const a = new HybridLogicalClock('a', () => nowA);
        const b = new HybridLogicalClock('b', () => nowB);
        let lastB = b.tick();
        for (const d of deltas) {
          nowA += d % 1_000;
          nowB += d % 7;
          const fromA = a.tick();
          const merged = b.receive(fromA);
          expect(compareHlc(fromA, merged)).toBe(-1);
          expect(compareHlc(lastB, merged)).toBe(-1);
          lastB = merged;
        }
      }),
    );
  });
});
