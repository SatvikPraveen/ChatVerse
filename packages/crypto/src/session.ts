import type { EncryptedPayload, PreKeyBundle } from '@chatverse/protocol';
import { fromBase64Url, toBase64Url, utf8 } from './encoding.js';
import { decodePairwise, encodePairwise } from './envelope.js';
import type { DeviceKeyStore } from './keys.js';
import { DoubleRatchet, type RatchetStateJSON } from './ratchet.js';
import { x3dhInitiate, x3dhRespond, type X3dhInitiatorResult } from './x3dh.js';

/**
 * A pairwise session between two devices: X3DH bootstrap + Double Ratchet steady state.
 * This is the object application code works with; it hides when the X3DH header has to be
 * attached (until the first reply is received) and how state is persisted.
 */

export interface PairwiseSessionJSON {
  peerDeviceId: string;
  ratchet: RatchetStateJSON;
  pendingX3dh: { ik: string; ek: string; spk: number; opk: number | null } | null;
}

export class PairwiseSession {
  private constructor(
    public readonly peerDeviceId: string,
    private ratchet: DoubleRatchet,
    private pendingX3dh: PairwiseSessionJSON['pendingX3dh'],
  ) {}

  /** Alice side: start a session from a fetched (and verified) pre-key bundle. */
  static initiate(ours: DeviceKeyStore, bundle: PreKeyBundle): PairwiseSession {
    const x: X3dhInitiatorResult = x3dhInitiate(ours, bundle);
    const ratchet = DoubleRatchet.initAsInitiator(
      x.sharedSecret,
      x.theirRatchetKey,
      x.associatedData,
    );
    x.sharedSecret.fill(0);
    return new PairwiseSession(bundle.deviceId, ratchet, {
      ik: toBase64Url(x.initialMessage.identityKey),
      ek: toBase64Url(x.initialMessage.ephemeralKey),
      spk: x.initialMessage.signedPreKeyId,
      opk: x.initialMessage.oneTimePreKeyId,
    });
  }

  /** Bob side: build a session from the first incoming message, then decrypt it. */
  static respond(
    ours: DeviceKeyStore,
    peerDeviceId: string,
    payload: EncryptedPayload,
  ): { session: PairwiseSession; plaintext: string } {
    const { message, meta } = decodePairwise(payload);
    if (!meta.x3dh) throw new Error('first message must carry X3DH parameters');
    const x = x3dhRespond(ours, {
      identityKey: fromBase64Url(meta.x3dh.ik),
      ephemeralKey: fromBase64Url(meta.x3dh.ek),
      signedPreKeyId: meta.x3dh.spk,
      oneTimePreKeyId: meta.x3dh.opk,
    });
    const ratchet = DoubleRatchet.initAsResponder(
      x.sharedSecret,
      ours.signedPreKey.keyPair,
      x.associatedData,
    );
    x.sharedSecret.fill(0);
    const session = new PairwiseSession(peerDeviceId, ratchet, null);
    const plaintext = utf8.decode(ratchet.decrypt(message));
    return { session, plaintext };
  }

  encrypt(plaintext: string): EncryptedPayload {
    const message = this.ratchet.encrypt(utf8.encode(plaintext));
    const meta = this.pendingX3dh
      ? { to: this.peerDeviceId, x3dh: this.pendingX3dh }
      : { to: this.peerDeviceId };
    return encodePairwise(message, meta);
  }

  decrypt(payload: EncryptedPayload): string {
    const { message } = decodePairwise(payload);
    const plaintext = utf8.decode(this.ratchet.decrypt(message));
    // Once the peer has replied, they have our identity and ephemeral keys: stop resending them.
    this.pendingX3dh = null;
    return plaintext;
  }

  toJSON(): PairwiseSessionJSON {
    return {
      peerDeviceId: this.peerDeviceId,
      ratchet: this.ratchet.toJSON(),
      pendingX3dh: this.pendingX3dh,
    };
  }

  static fromJSON(json: PairwiseSessionJSON): PairwiseSession {
    return new PairwiseSession(
      json.peerDeviceId,
      DoubleRatchet.fromJSON(json.ratchet),
      json.pendingX3dh,
    );
  }
}
