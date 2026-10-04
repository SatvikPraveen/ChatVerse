/** Byte/string helpers that work identically in browsers and Node without Buffer. */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_LOOKUP = new Uint8Array(128).fill(255);
for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64.charCodeAt(i)] = i;

export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n =
      ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8) | (bytes[i + 2] as number);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
  }
  if (i < bytes.length) {
    const b0 = bytes[i] as number;
    const b1 = i + 1 < bytes.length ? (bytes[i + 1] as number) : 0;
    const n = (b0 << 16) | (b1 << 8);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63]!;
  }
  return out;
}

export function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('invalid base64url input');
  const len = Math.floor((text.length * 3) / 4);
  const out = new Uint8Array(len);
  let buffer = 0;
  let bits = 0;
  let j = 0;
  for (let i = 0; i < text.length; i++) {
    buffer = (buffer << 6) | (B64_LOOKUP[text.charCodeAt(i)] as number);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (buffer >> bits) & 0xff;
    }
  }
  return out;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const utf8 = {
  encode: (s: string): Uint8Array => encoder.encode(s),
  decode: (b: Uint8Array): string => decoder.decode(b),
};

export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}

/** Big-endian 32-bit unsigned integer. */
export function u32(n: number): Uint8Array {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw new RangeError('u32 out of range');
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}
