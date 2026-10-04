import type { EncryptedPayload } from '@chatverse/protocol';
import { fromBase64Url, toBase64Url, utf8 } from './encoding.js';
import { decodeHeader, encodeHeader, type RatchetMessage } from './ratchet.js';
import type { SenderKeyMessage } from './senderkey.js';

/**
 * Serialisation between in-memory ratchet messages and the opaque `EncryptedPayload` the
 * server relays. The suite string lets clients negotiate upgrades without a protocol bump.
 */

export const SUITES = {
  /** Pairwise: X3DH + Double Ratchet, XChaCha20-Poly1305. */
  PAIRWISE: 'x3dh-dr-xchacha20-v1',
  /** Group: Sender Keys, XChaCha20-Poly1305 + Ed25519. */
  GROUP: 'senderkey-xchacha20-v1',
} as const;

export interface PairwiseEnvelopeHeader {
  /** Recipient device id so multi-device recipients know which session to use. */
  to: string;
  /**
   * Sender device id. Unauthenticated routing metadata (like `to`); a responder uses it to
   * address replies to the right device of a multi-device peer.
   */
  from?: string;
  /** Present only on the first message of a session (X3DH initial message). */
  x3dh?: { ik: string; ek: string; spk: number; opk: number | null };
}

export function encodePairwise(message: RatchetMessage, meta: PairwiseEnvelopeHeader): EncryptedPayload {
  const header = { ...meta, dr: toBase64Url(encodeHeader(message.header)) };
  return {
    v: 1,
    suite: SUITES.PAIRWISE,
    header: toBase64Url(utf8.encode(JSON.stringify(header))),
    ciphertext: toBase64Url(message.ciphertext),
  };
}

export function decodePairwise(payload: EncryptedPayload): { message: RatchetMessage; meta: PairwiseEnvelopeHeader } {
  if (payload.suite !== SUITES.PAIRWISE) throw new Error(`unexpected suite ${payload.suite}`);
  const parsed = JSON.parse(utf8.decode(fromBase64Url(payload.header))) as PairwiseEnvelopeHeader & { dr: string };
  const { dr, ...meta } = parsed;
  return { message: { header: decodeHeader(fromBase64Url(dr)), ciphertext: fromBase64Url(payload.ciphertext) }, meta };
}

export function encodeGroup(message: SenderKeyMessage): EncryptedPayload {
  const header = { keyId: message.keyId, iteration: message.iteration, sig: toBase64Url(message.signature) };
  return {
    v: 1,
    suite: SUITES.GROUP,
    header: toBase64Url(utf8.encode(JSON.stringify(header))),
    ciphertext: toBase64Url(message.ciphertext),
  };
}

export function decodeGroup(payload: EncryptedPayload): SenderKeyMessage {
  if (payload.suite !== SUITES.GROUP) throw new Error(`unexpected suite ${payload.suite}`);
  const header = JSON.parse(utf8.decode(fromBase64Url(payload.header))) as { keyId: number; iteration: number; sig: string };
  return {
    keyId: header.keyId,
    iteration: header.iteration,
    signature: fromBase64Url(header.sig),
    ciphertext: fromBase64Url(payload.ciphertext),
  };
}
