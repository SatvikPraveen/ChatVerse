import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { bytesEqual, fromBase64Url, toBase64Url, u32 } from './encoding.js';

describe('encoding', () => {
  it('base64url round-trips arbitrary bytes (property)', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 512 }), (bytes) => {
        const encoded = toBase64Url(bytes);
        expect(encoded).toMatch(/^[A-Za-z0-9_-]*$/);
        expect(bytesEqual(fromBase64Url(encoded), bytes)).toBe(true);
      }),
    );
  });

  it('matches Node Buffer base64url', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 64 }), (bytes) => {
        expect(toBase64Url(bytes)).toBe(Buffer.from(bytes).toString('base64url'));
      }),
    );
  });

  it('rejects invalid characters', () => {
    expect(() => fromBase64Url('abc+/=')).toThrow();
  });

  it('u32 is big-endian', () => {
    expect([...u32(0x01020304)]).toEqual([1, 2, 3, 4]);
    expect(() => u32(-1)).toThrow();
  });
});
