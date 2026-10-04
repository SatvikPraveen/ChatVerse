import { concatBytes, fromBase64Url, toBase64Url, u32 } from './encoding.js';
import {
  aeadDecrypt,
  aeadEncrypt,
  deriveMessageCipher,
  generateSigningKeyPair,
  mac,
  random,
  sign,
  verify,
  KEY_LEN,
  type KeyPair,
} from './primitives.js';

/**
 * Sender Keys for group messaging (as in Signal's group protocol / Whatsapp).
 *
 * Each member owns a symmetric hash chain plus a signing key. A message is encrypted once with
 * the sender's current chain key and signed; every recipient holds a copy of the sender's chain
 * state (received over pairwise Double Ratchet sessions) and can ratchet forward to the right
 * iteration. Cost is O(1) encryptions per message instead of O(members), at the price of forward
 * secrecy being per-chain-rotation rather than per-message. Chains are rotated on membership
 * change.
 */

export const SENDER_KEY_MAX_SKIP = 2000;
const CK_MESSAGE = new Uint8Array([0x01]);
const CK_NEXT = new Uint8Array([0x02]);
const MSG_INFO = 'ChatVerse-SK-msg-v1';

export interface SenderKeyDistribution {
  keyId: number;
  iteration: number;
  chainKey: string;
  signingKey: string;
}

export interface SenderKeyMessage {
  keyId: number;
  iteration: number;
  ciphertext: Uint8Array;
  signature: Uint8Array;
}

export interface SenderKeyStateJSON {
  keyId: number;
  iteration: number;
  chainKey: string;
  signingPublic: string;
  signingPrivate: string | null;
  skipped: Array<{ iteration: number; mk: string }>;
}

export class SenderKeyState {
  private skipped = new Map<number, Uint8Array>();

  private constructor(
    public readonly keyId: number,
    private iteration: number,
    private chainKey: Uint8Array,
    private signing: { publicKey: Uint8Array; privateKey: Uint8Array | null },
  ) {}

  /** Create a fresh sender key for ourselves. */
  static create(keyId = randomKeyId()): SenderKeyState {
    const signing: KeyPair = generateSigningKeyPair();
    return new SenderKeyState(keyId, 0, random(KEY_LEN), signing);
  }

  /** Import a peer's distribution message. */
  static fromDistribution(d: SenderKeyDistribution): SenderKeyState {
    return new SenderKeyState(d.keyId, d.iteration, fromBase64Url(d.chainKey), {
      publicKey: fromBase64Url(d.signingKey),
      privateKey: null,
    });
  }

  /** What to send (over a pairwise encrypted session) to every other member. */
  distribution(): SenderKeyDistribution {
    return {
      keyId: this.keyId,
      iteration: this.iteration,
      chainKey: toBase64Url(this.chainKey),
      signingKey: toBase64Url(this.signing.publicKey),
    };
  }

  encrypt(plaintext: Uint8Array, aad: Uint8Array = new Uint8Array()): SenderKeyMessage {
    if (!this.signing.privateKey) throw new Error('cannot encrypt with an imported sender key');
    const iteration = this.iteration;
    const mk = mac(this.chainKey, CK_MESSAGE);
    this.chainKey = mac(this.chainKey, CK_NEXT);
    this.iteration += 1;
    const { key, nonce } = deriveMessageCipher(mk, MSG_INFO);
    const fullAad = concatBytes(aad, u32(this.keyId), u32(iteration));
    const ciphertext = aeadEncrypt(key, nonce, plaintext, fullAad);
    const signature = sign(concatBytes(fullAad, ciphertext), this.signing.privateKey);
    mk.fill(0);
    return { keyId: this.keyId, iteration, ciphertext, signature };
  }

  decrypt(message: SenderKeyMessage, aad: Uint8Array = new Uint8Array()): Uint8Array {
    if (message.keyId !== this.keyId) throw new Error('sender key id mismatch');
    const fullAad = concatBytes(aad, u32(message.keyId), u32(message.iteration));
    if (!verify(message.signature, concatBytes(fullAad, message.ciphertext), this.signing.publicKey)) {
      throw new Error('sender key signature invalid');
    }
    const mk = this.messageKeyFor(message.iteration);
    const { key, nonce } = deriveMessageCipher(mk, MSG_INFO);
    const plaintext = aeadDecrypt(key, nonce, message.ciphertext, fullAad);
    mk.fill(0);
    return plaintext;
  }

  private messageKeyFor(iteration: number): Uint8Array {
    const cached = this.skipped.get(iteration);
    if (cached) {
      this.skipped.delete(iteration);
      return cached;
    }
    if (iteration < this.iteration) throw new Error('message key already consumed (replay or duplicate)');
    if (iteration - this.iteration > SENDER_KEY_MAX_SKIP) throw new Error('too many skipped sender-key iterations');
    while (this.iteration < iteration) {
      this.skipped.set(this.iteration, mac(this.chainKey, CK_MESSAGE));
      this.chainKey = mac(this.chainKey, CK_NEXT);
      this.iteration += 1;
    }
    const mk = mac(this.chainKey, CK_MESSAGE);
    this.chainKey = mac(this.chainKey, CK_NEXT);
    this.iteration += 1;
    return mk;
  }

  toJSON(): SenderKeyStateJSON {
    return {
      keyId: this.keyId,
      iteration: this.iteration,
      chainKey: toBase64Url(this.chainKey),
      signingPublic: toBase64Url(this.signing.publicKey),
      signingPrivate: this.signing.privateKey ? toBase64Url(this.signing.privateKey) : null,
      skipped: [...this.skipped.entries()].map(([iteration, mk]) => ({ iteration, mk: toBase64Url(mk) })),
    };
  }

  static fromJSON(json: SenderKeyStateJSON): SenderKeyState {
    const s = new SenderKeyState(json.keyId, json.iteration, fromBase64Url(json.chainKey), {
      publicKey: fromBase64Url(json.signingPublic),
      privateKey: json.signingPrivate ? fromBase64Url(json.signingPrivate) : null,
    });
    s.skipped = new Map(json.skipped.map((e) => [e.iteration, fromBase64Url(e.mk)]));
    return s;
  }
}

function randomKeyId(): number {
  const b = random(4);
  return (((b[0] as number) << 24) | ((b[1] as number) << 16) | ((b[2] as number) << 8) | (b[3] as number)) >>> 0;
}
