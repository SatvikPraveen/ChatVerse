import { bytesEqual, concatBytes, fromBase64Url, toBase64Url, u32 } from './encoding.js';
import {
  aeadDecrypt,
  aeadEncrypt,
  deriveMessageCipher,
  dh,
  generateDhKeyPair,
  kdf,
  KEY_LEN,
  mac,
  type KeyPair,
} from './primitives.js';

/**
 * Double Ratchet (Perrin & Marlinspike, 2016) with header-in-AAD and bounded skipped-key storage.
 *
 * Each message key is used exactly once and derived from a symmetric chain, which gives forward
 * secrecy per message. Every time the sender flips (a reply arrives), a fresh DH exchange feeds a
 * new root key, which gives post-compromise security ("self-healing").
 */

export const MAX_SKIP = 1000;
const RK_INFO = 'ChatVerse-DR-root-v1';
const MSG_INFO = 'ChatVerse-DR-msg-v1';
const CK_MESSAGE = new Uint8Array([0x01]);
const CK_NEXT = new Uint8Array([0x02]);

export interface RatchetHeader {
  /** Sender's current ratchet public key. */
  dh: Uint8Array;
  /** Number of messages in the previous sending chain. */
  pn: number;
  /** Message number in the current sending chain. */
  n: number;
}

export interface RatchetMessage {
  header: RatchetHeader;
  ciphertext: Uint8Array;
}

interface SkippedKey {
  mk: Uint8Array;
}

export interface RatchetStateJSON {
  dhs: { pub: string; priv: string };
  dhr: string | null;
  rk: string;
  cks: string | null;
  ckr: string | null;
  ns: number;
  nr: number;
  pn: number;
  skipped: Array<{ dh: string; n: number; mk: string }>;
  ad: string;
}

export class DoubleRatchet {
  private DHs: KeyPair;
  private DHr: Uint8Array | null;
  private RK: Uint8Array;
  private CKs: Uint8Array | null;
  private CKr: Uint8Array | null;
  private Ns = 0;
  private Nr = 0;
  private PN = 0;
  private skipped = new Map<string, SkippedKey>();
  private readonly AD: Uint8Array;

  private constructor(init: {
    DHs: KeyPair;
    DHr: Uint8Array | null;
    RK: Uint8Array;
    CKs: Uint8Array | null;
    CKr: Uint8Array | null;
    AD: Uint8Array;
  }) {
    this.DHs = init.DHs;
    this.DHr = init.DHr;
    this.RK = init.RK;
    this.CKs = init.CKs;
    this.CKr = init.CKr;
    this.AD = init.AD;
  }

  /** Alice: she knows Bob's ratchet key (his signed pre-key) and can send immediately. */
  static initAsInitiator(
    sharedSecret: Uint8Array,
    theirRatchetKey: Uint8Array,
    associatedData: Uint8Array,
  ): DoubleRatchet {
    const DHs = generateDhKeyPair();
    const [RK, CKs] = kdfRootKey(sharedSecret, dh(DHs.privateKey, theirRatchetKey));
    return new DoubleRatchet({
      DHs,
      DHr: theirRatchetKey.slice(),
      RK,
      CKs,
      CKr: null,
      AD: associatedData.slice(),
    });
  }

  /**
   * Bob: he waits for Alice's first message, which carries her ratchet key.
   * All inputs are copied so callers may wipe their buffers after construction.
   */
  static initAsResponder(
    sharedSecret: Uint8Array,
    ourRatchetKeyPair: KeyPair,
    associatedData: Uint8Array,
  ): DoubleRatchet {
    return new DoubleRatchet({
      DHs: {
        publicKey: ourRatchetKeyPair.publicKey.slice(),
        privateKey: ourRatchetKeyPair.privateKey.slice(),
      },
      DHr: null,
      RK: sharedSecret.slice(),
      CKs: null,
      CKr: null,
      AD: associatedData.slice(),
    });
  }

  encrypt(plaintext: Uint8Array): RatchetMessage {
    if (!this.CKs) throw new Error('sending chain not initialised');
    const [ck, mk] = kdfChainKey(this.CKs);
    this.CKs = ck;
    const header: RatchetHeader = { dh: this.DHs.publicKey, pn: this.PN, n: this.Ns };
    this.Ns += 1;
    const { key, nonce } = deriveMessageCipher(mk, MSG_INFO);
    const ciphertext = aeadEncrypt(
      key,
      nonce,
      plaintext,
      concatBytes(this.AD, encodeHeader(header)),
    );
    mk.fill(0);
    return { header, ciphertext };
  }

  decrypt(message: RatchetMessage): Uint8Array {
    const { header, ciphertext } = message;
    const aad = concatBytes(this.AD, encodeHeader(header));

    const skippedKey = this.skipped.get(skipKey(header.dh, header.n));
    if (skippedKey) {
      this.skipped.delete(skipKey(header.dh, header.n));
      return open(skippedKey.mk, ciphertext, aad);
    }

    // Work on a snapshot so that a failed decryption (forgery / corruption) leaves state intact.
    const snapshot = this.toJSON();
    try {
      if (!this.DHr || !bytesEqual(header.dh, this.DHr)) {
        this.skipMessageKeys(header.pn);
        this.dhRatchet(header.dh);
      }
      this.skipMessageKeys(header.n);
      if (!this.CKr) throw new Error('receiving chain not initialised');
      const [ck, mk] = kdfChainKey(this.CKr);
      this.CKr = ck;
      this.Nr += 1;
      return open(mk, ciphertext, aad);
    } catch (err) {
      this.restore(snapshot);
      throw err;
    }
  }

  private skipMessageKeys(until: number): void {
    if (this.Nr + MAX_SKIP < until)
      throw new Error(`too many skipped messages (${until - this.Nr} > ${MAX_SKIP})`);
    if (!this.CKr || !this.DHr) return;
    while (this.Nr < until) {
      const [ck, mk] = kdfChainKey(this.CKr);
      this.CKr = ck;
      this.skipped.set(skipKey(this.DHr, this.Nr), { mk });
      this.Nr += 1;
    }
    // Bound memory: evict oldest skipped keys beyond MAX_SKIP.
    while (this.skipped.size > MAX_SKIP) {
      const oldest = this.skipped.keys().next().value as string;
      this.skipped.delete(oldest);
    }
  }

  private dhRatchet(theirNewKey: Uint8Array): void {
    this.PN = this.Ns;
    this.Ns = 0;
    this.Nr = 0;
    this.DHr = theirNewKey;
    [this.RK, this.CKr] = kdfRootKey(this.RK, dh(this.DHs.privateKey, this.DHr));
    this.DHs = generateDhKeyPair();
    [this.RK, this.CKs] = kdfRootKey(this.RK, dh(this.DHs.privateKey, this.DHr));
  }

  get publicRatchetKey(): Uint8Array {
    return this.DHs.publicKey;
  }

  toJSON(): RatchetStateJSON {
    return {
      dhs: { pub: toBase64Url(this.DHs.publicKey), priv: toBase64Url(this.DHs.privateKey) },
      dhr: this.DHr ? toBase64Url(this.DHr) : null,
      rk: toBase64Url(this.RK),
      cks: this.CKs ? toBase64Url(this.CKs) : null,
      ckr: this.CKr ? toBase64Url(this.CKr) : null,
      ns: this.Ns,
      nr: this.Nr,
      pn: this.PN,
      skipped: [...this.skipped.entries()].map(([k, v]) => {
        const [dhPart, nPart] = k.split(':') as [string, string];
        return { dh: dhPart, n: Number(nPart), mk: toBase64Url(v.mk) };
      }),
      ad: toBase64Url(this.AD),
    };
  }

  static fromJSON(json: RatchetStateJSON): DoubleRatchet {
    const r = new DoubleRatchet({
      DHs: { publicKey: fromBase64Url(json.dhs.pub), privateKey: fromBase64Url(json.dhs.priv) },
      DHr: json.dhr ? fromBase64Url(json.dhr) : null,
      RK: fromBase64Url(json.rk),
      CKs: json.cks ? fromBase64Url(json.cks) : null,
      CKr: json.ckr ? fromBase64Url(json.ckr) : null,
      AD: fromBase64Url(json.ad),
    });
    r.restore(json);
    return r;
  }

  private restore(json: RatchetStateJSON): void {
    this.DHs = { publicKey: fromBase64Url(json.dhs.pub), privateKey: fromBase64Url(json.dhs.priv) };
    this.DHr = json.dhr ? fromBase64Url(json.dhr) : null;
    this.RK = fromBase64Url(json.rk);
    this.CKs = json.cks ? fromBase64Url(json.cks) : null;
    this.CKr = json.ckr ? fromBase64Url(json.ckr) : null;
    this.Ns = json.ns;
    this.Nr = json.nr;
    this.PN = json.pn;
    this.skipped = new Map(
      json.skipped.map((s) => [`${s.dh}:${s.n}`, { mk: fromBase64Url(s.mk) }]),
    );
  }
}

function kdfRootKey(rk: Uint8Array, dhOut: Uint8Array): [Uint8Array, Uint8Array] {
  const out = kdf(dhOut, rk, RK_INFO, KEY_LEN * 2);
  return [out.slice(0, KEY_LEN), out.slice(KEY_LEN)];
}

function kdfChainKey(ck: Uint8Array): [Uint8Array, Uint8Array] {
  return [mac(ck, CK_NEXT), mac(ck, CK_MESSAGE)];
}

function open(mk: Uint8Array, ciphertext: Uint8Array, aad: Uint8Array): Uint8Array {
  const { key, nonce } = deriveMessageCipher(mk, MSG_INFO);
  const plaintext = aeadDecrypt(key, nonce, ciphertext, aad);
  mk.fill(0);
  return plaintext;
}

function skipKey(dhPub: Uint8Array, n: number): string {
  return `${toBase64Url(dhPub)}:${n}`;
}

export function encodeHeader(h: RatchetHeader): Uint8Array {
  return concatBytes(h.dh, u32(h.pn), u32(h.n));
}

export function decodeHeader(bytes: Uint8Array): RatchetHeader {
  if (bytes.length !== 32 + 8) throw new Error('malformed ratchet header');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { dh: bytes.slice(0, 32), pn: view.getUint32(32), n: view.getUint32(36) };
}
