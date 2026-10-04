import { ed25519, x25519 } from '@noble/curves/ed25519';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { hkdf } from '@noble/hashes/hkdf';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from '@noble/hashes/utils';
import { concatBytes } from './encoding.js';

/**
 * Thin, named wrappers over the audited @noble primitives so that the protocol code reads like
 * the specifications it implements. Cipher suite: X25519 / Ed25519 / HKDF-SHA256 /
 * HMAC-SHA256 / XChaCha20-Poly1305.
 */

export const KEY_LEN = 32;
export const NONCE_LEN = 24;

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export function generateDhKeyPair(): KeyPair {
  const privateKey = x25519.utils.randomPrivateKey();
  return { privateKey, publicKey: x25519.getPublicKey(privateKey) };
}

export function dh(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(privateKey, publicKey);
}

export function generateSigningKeyPair(): KeyPair {
  const privateKey = ed25519.utils.randomPrivateKey();
  return { privateKey, publicKey: ed25519.getPublicKey(privateKey) };
}

export function sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return ed25519.sign(message, privateKey);
}

export function verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

export function kdf(ikm: Uint8Array, salt: Uint8Array | undefined, info: string, length: number): Uint8Array {
  return hkdf(sha256, ikm, salt, info, length);
}

export function mac(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha256, key, data);
}

export function random(length: number): Uint8Array {
  return randomBytes(length);
}

export function aeadEncrypt(key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Uint8Array {
  return xchacha20poly1305(key, nonce, aad).encrypt(plaintext);
}

export function aeadDecrypt(key: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array, aad: Uint8Array): Uint8Array {
  return xchacha20poly1305(key, nonce, aad).decrypt(ciphertext);
}

/**
 * Derive an AEAD key and nonce from a one-shot message key. The message key is never used
 * directly as the cipher key so that a compromised message key reveals nothing about the chain.
 */
export function deriveMessageCipher(messageKey: Uint8Array, info: string): { key: Uint8Array; nonce: Uint8Array } {
  const material = kdf(messageKey, new Uint8Array(KEY_LEN), info, KEY_LEN + NONCE_LEN);
  return { key: material.slice(0, KEY_LEN), nonce: material.slice(KEY_LEN) };
}

export function hash(...parts: Uint8Array[]): Uint8Array {
  return sha256(concatBytes(...parts));
}
