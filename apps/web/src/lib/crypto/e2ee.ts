import {
  PairwiseSession,
  SenderKeyState,
  SUITES,
  decodeGroup,
  decodePairwise,
  encodeGroup,
  fromBase64Url,
  replenishOneTimePreKeys,
  safetyNumber,
  toBase64Url,
  utf8,
  type PairwiseSessionJSON,
  type SenderKeyDistribution,
  type SenderKeyStateJSON,
} from '@chatverse/crypto';
import type {
  Conversation,
  EncryptedPayload,
  Message,
  OneTimePreKey,
  PreKeyBundle,
  PreKeyBundleUpload,
} from '@chatverse/protocol';
import type { KeyValueStore } from '../storage';
import {
  DEFAULT_ONE_TIME_PREKEYS,
  MIN_ONE_TIME_PREKEYS,
  deserializeKeys,
  generateDeviceKeys,
  serializeKeys,
  toUpload,
  type DeviceKeys,
} from './keystore';

/**
 * Client-side end-to-end encryption engine.
 *
 * Direct conversations use one pairwise session per peer (X3DH bootstrap + Double Ratchet).
 * Group conversations use Sender Keys: each member owns a symmetric chain for the group and
 * hands it to every other member through a pairwise-encrypted control message (`skdm`) sent in
 * the group itself; a header `to` field lets non-recipients hide those control messages without
 * being able to read them. Chains are rotated whenever the member set changes, so removed
 * members cannot read later traffic and added members cannot read earlier traffic.
 *
 * Everything that must survive a reload lives in the injected `KeyValueStore` under keys scoped
 * by user id (and device id for the key store): the device key store (private keys included),
 * pairwise sessions, group sender keys and the plaintext cache. Message keys are single use, so
 * without the plaintext cache an already-decrypted message could not be shown again after reload.
 */

export interface KeyServer {
  uploadBundle(upload: PreKeyBundleUpload): Promise<void>;
  uploadOneTime(deviceId: string, keys: OneTimePreKey[]): Promise<void>;
  /** Fetch (and consume) a pre-key bundle for one device of a user. */
  fetchBundle(userId: string): Promise<PreKeyBundle>;
  /** Remaining one-time pre-keys for our device; null when the server does not know the device. */
  countOneTime(deviceId: string): Promise<number | null>;
}

export interface E2EEOptions {
  userId: string;
  deviceId: string;
  storage: KeyValueStore;
  keyServer: KeyServer;
}

export type DecryptOutcome =
  | { kind: 'text'; text: string }
  /** A sender-key distribution was consumed; retry messages waiting for keys in that conversation. */
  | { kind: 'control'; conversationId: string }
  /** Control traffic addressed to another member: never shown. */
  | { kind: 'hidden' }
  | { kind: 'waiting-keys' }
  /** Encrypted for a different device of ours (or sent by one): unreadable here by design. */
  | { kind: 'other-device' }
  | { kind: 'failed'; reason: string };

interface SessionRecord {
  peerUserId: string;
  peerDeviceId: string;
  peerIdentityKey: string;
  initiatedByMe: boolean;
  session: PairwiseSessionJSON;
}

interface OwnSenderKey {
  state: SenderKeyStateJSON;
  /** Sorted member ids the key was created for; a change triggers rotation. */
  membersKey: string;
  distributedTo: string[];
}

interface GroupState {
  own: Record<string, OwnSenderKey>;
  peers: Record<string, Record<string, SenderKeyStateJSON>>;
}

interface ControlMessage {
  t: 'skdm';
  conversationId: string;
  distribution: SenderKeyDistribution;
}

const PLAINTEXT_CACHE_MAX = 5_000;

export class E2EE {
  private keys!: DeviceKeys;
  private sessions: Record<string, SessionRecord> = {};
  private groups: GroupState = { own: {}, peers: {} };
  private plaintext: Record<string, string> = {};
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor(private readonly opts: E2EEOptions) {}

  private key(suffix: string): string {
    return `cv:e2ee:${this.opts.userId}:${suffix}`;
  }

  /** Load persisted state (or generate fresh keys) and make sure the server knows this device. */
  static async open(opts: E2EEOptions): Promise<E2EE> {
    const e = new E2EE(opts);
    const { storage } = opts;
    const stored = await storage.get<ReturnType<typeof serializeKeys>>(
      e.key(`${opts.deviceId}:keys`),
    );
    if (stored) {
      e.keys = deserializeKeys(stored);
    } else {
      const { keys, upload } = generateDeviceKeys(opts.deviceId);
      e.keys = keys;
      await opts.keyServer.uploadBundle(upload);
      await e.persistKeys();
    }
    e.sessions = (await storage.get<Record<string, SessionRecord>>(e.key('sessions'))) ?? {};
    e.groups = (await storage.get<GroupState>(e.key('groups'))) ?? { own: {}, peers: {} };
    e.plaintext = (await storage.get<Record<string, string>>(e.key('plaintext'))) ?? {};
    await e.ensureServerHasKeys();
    return e;
  }

  /** Re-publish the bundle if the server forgot it and top up one-time pre-keys when low. */
  async ensureServerHasKeys(): Promise<void> {
    const count = await this.opts.keyServer.countOneTime(this.opts.deviceId);
    if (count === null) {
      await this.opts.keyServer.uploadBundle(toUpload(this.keys));
      return;
    }
    if (count < MIN_ONE_TIME_PREKEYS) {
      const fresh = replenishOneTimePreKeys(this.keys.store, DEFAULT_ONE_TIME_PREKEYS);
      await this.persistKeys();
      await this.opts.keyServer.uploadOneTime(this.opts.deviceId, fresh);
    }
  }

  get deviceId(): string {
    return this.opts.deviceId;
  }

  /** Base64url X25519 identity public key of this device. */
  get identityKey(): string {
    return toBase64Url(this.keys.store.identity.identity.publicKey);
  }

  /** Human-comparable fingerprint of our identity and a peer's; null until a session exists. */
  safetyNumberWith(peerUserId: string): string | null {
    const rec = this.sessions[peerUserId];
    if (!rec) return null;
    return safetyNumber(
      this.keys.store.identity.identity.publicKey,
      fromBase64Url(rec.peerIdentityKey),
    );
  }

  hasSessionWith(peerUserId: string): boolean {
    return peerUserId in this.sessions;
  }

  cachedPlaintext(messageId: string): string | undefined {
    return this.plaintext[messageId];
  }

  rememberPlaintext(messageId: string, text: string): void {
    this.plaintext[messageId] = text;
    this.schedulePersist();
  }

  /** Drop a cached plaintext (an edited message carries a new payload under the same id). */
  forgetPlaintext(messageId: string): void {
    delete this.plaintext[messageId];
    this.schedulePersist();
  }

  // ---------------------------------------------------------------------------------------------
  // Encrypt
  // ---------------------------------------------------------------------------------------------

  /**
   * Encrypt `plaintext` for a conversation. For groups, `preamble` holds sender-key distribution
   * control payloads that must be sent (in order) before `payload`.
   */
  async encrypt(
    conversation: Conversation,
    plaintext: string,
  ): Promise<{ payload: EncryptedPayload; preamble: EncryptedPayload[] }> {
    const others = conversation.participants
      .map((p) => p.userId)
      .filter((id) => id !== this.opts.userId);
    if (conversation.kind === 'direct') {
      const peer = others[0];
      if (!peer) throw new Error('direct conversation has no peer');
      const { session, record } = await this.ensureSession(peer);
      const payload = this.tagSender(session.encrypt(plaintext));
      record.session = session.toJSON();
      await this.persistSessions();
      return { payload, preamble: [] };
    }
    return this.encryptForGroup(conversation.id, others, plaintext);
  }

  private async encryptForGroup(conversationId: string, others: string[], plaintext: string) {
    const membersKey = [...others].sort().join(',');
    let own = this.groups.own[conversationId];
    if (!own || own.membersKey !== membersKey) {
      own = { state: SenderKeyState.create().toJSON(), membersKey, distributedTo: [] };
      this.groups.own[conversationId] = own;
    }
    const state = SenderKeyState.fromJSON(own.state);
    const preamble: EncryptedPayload[] = [];
    for (const member of others) {
      if (own.distributedTo.includes(member)) continue;
      const control: ControlMessage = {
        t: 'skdm',
        conversationId,
        distribution: state.distribution(),
      };
      const { session, record } = await this.ensureSession(member);
      preamble.push(this.tagSender(session.encrypt(JSON.stringify(control))));
      record.session = session.toJSON();
      own.distributedTo.push(member);
    }
    const payload = encodeGroup(state.encrypt(utf8.encode(plaintext), utf8.encode(conversationId)));
    own.state = state.toJSON();
    await Promise.all([this.persistSessions(), this.persistGroups()]);
    return { payload, preamble };
  }

  private async ensureSession(
    peerUserId: string,
  ): Promise<{ session: PairwiseSession; record: SessionRecord }> {
    const existing = this.sessions[peerUserId];
    if (existing) return { session: PairwiseSession.fromJSON(existing.session), record: existing };
    const bundle = await this.opts.keyServer.fetchBundle(peerUserId);
    const session = PairwiseSession.initiate(this.keys.store, bundle);
    const record: SessionRecord = {
      peerUserId,
      peerDeviceId: bundle.deviceId,
      peerIdentityKey: bundle.identityKey,
      initiatedByMe: true,
      session: session.toJSON(),
    };
    this.sessions[peerUserId] = record;
    return { session, record };
  }

  /** Stamp our device id into the (unauthenticated) routing header so the peer can reply to us. */
  private tagSender(payload: EncryptedPayload): EncryptedPayload {
    const header = JSON.parse(utf8.decode(fromBase64Url(payload.header))) as Record<
      string,
      unknown
    >;
    header.from = this.opts.deviceId;
    return { ...payload, header: toBase64Url(utf8.encode(JSON.stringify(header))) };
  }

  // ---------------------------------------------------------------------------------------------
  // Decrypt
  // ---------------------------------------------------------------------------------------------

  async decrypt(conversation: Conversation, message: Message): Promise<DecryptOutcome> {
    const cached = this.plaintext[message.id];
    if (cached !== undefined) return { kind: 'text', text: cached };
    if (!message.encrypted) return { kind: 'failed', reason: 'no payload' };
    if (message.senderId === this.opts.userId) return { kind: 'other-device' };

    const outcome =
      message.encrypted.suite === SUITES.PAIRWISE
        ? await this.decryptPairwise(conversation, message, message.encrypted)
        : message.encrypted.suite === SUITES.GROUP
          ? await this.decryptGroup(conversation, message, message.encrypted)
          : { kind: 'failed' as const, reason: `unknown suite ${message.encrypted.suite}` };

    if (outcome.kind === 'text') this.rememberPlaintext(message.id, outcome.text);
    return outcome;
  }

  private async decryptPairwise(
    conversation: Conversation,
    message: Message,
    payload: EncryptedPayload,
  ): Promise<DecryptOutcome> {
    let meta;
    try {
      meta = decodePairwise(payload).meta;
    } catch (err) {
      return { kind: 'failed', reason: (err as Error).message };
    }
    if (meta.to !== this.opts.deviceId)
      return conversation.kind === 'group' ? { kind: 'hidden' } : { kind: 'other-device' };

    const sender = message.senderId;
    const record = this.sessions[sender];
    let text: string | null = null;

    if (record) {
      try {
        const session = PairwiseSession.fromJSON(record.session);
        text = session.decrypt(payload);
        record.session = session.toJSON();
      } catch (err) {
        // A simultaneous-initiation race leaves both sides with different sessions. The side with
        // the lower user id keeps its session; the other adopts the peer's X3DH offer.
        const adopt = meta.x3dh && (!record.initiatedByMe || sender < this.opts.userId);
        if (!adopt) return { kind: 'failed', reason: (err as Error).message };
        const replaced = this.respondToOffer(sender, meta.from, meta.x3dh!.ik, payload);
        if (replaced.kind !== 'text') return replaced;
        text = replaced.text;
      }
    } else if (meta.x3dh) {
      const created = this.respondToOffer(sender, meta.from, meta.x3dh.ik, payload);
      if (created.kind !== 'text') return created;
      text = created.text;
    } else {
      return { kind: 'waiting-keys' };
    }

    await this.persistSessions();

    if (conversation.kind === 'group') {
      const control = parseControl(text);
      if (control) {
        this.groups.peers[control.conversationId] ??= {};
        this.groups.peers[control.conversationId]![sender] = SenderKeyState.fromDistribution(
          control.distribution,
        ).toJSON();
        await this.persistGroups();
        return { kind: 'control', conversationId: control.conversationId };
      }
    }
    return { kind: 'text', text };
  }

  private respondToOffer(
    sender: string,
    fromDevice: string | undefined,
    peerIdentityKey: string,
    payload: EncryptedPayload,
  ): DecryptOutcome {
    try {
      const { session, plaintext } = PairwiseSession.respond(
        this.keys.store,
        fromDevice ?? 'unknown-device',
        payload,
      );
      this.sessions[sender] = {
        peerUserId: sender,
        peerDeviceId: fromDevice ?? 'unknown-device',
        peerIdentityKey,
        initiatedByMe: false,
        session: session.toJSON(),
      };
      void this.persistKeys(); // a one-time pre-key may have been consumed
      return { kind: 'text', text: plaintext };
    } catch (err) {
      return { kind: 'failed', reason: (err as Error).message };
    }
  }

  private async decryptGroup(
    conversation: Conversation,
    message: Message,
    payload: EncryptedPayload,
  ): Promise<DecryptOutcome> {
    const json = this.groups.peers[conversation.id]?.[message.senderId];
    if (!json) return { kind: 'waiting-keys' };
    const state = SenderKeyState.fromJSON(json);
    try {
      const text = utf8.decode(state.decrypt(decodeGroup(payload), utf8.encode(conversation.id)));
      this.groups.peers[conversation.id]![message.senderId] = state.toJSON();
      await this.persistGroups();
      return { kind: 'text', text };
    } catch (err) {
      return { kind: 'failed', reason: (err as Error).message };
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------------------------

  private persistKeys(): Promise<void> {
    return this.opts.storage.set(this.key(`${this.opts.deviceId}:keys`), serializeKeys(this.keys));
  }

  private persistSessions(): Promise<void> {
    return this.opts.storage.set(this.key('sessions'), this.sessions);
  }

  private persistGroups(): Promise<void> {
    return this.opts.storage.set(this.key('groups'), this.groups);
  }

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      const entries = Object.entries(this.plaintext);
      if (entries.length > PLAINTEXT_CACHE_MAX)
        this.plaintext = Object.fromEntries(entries.slice(-PLAINTEXT_CACHE_MAX));
      void this.opts.storage.set(this.key('plaintext'), this.plaintext);
    }, 250);
  }

  /** Flush pending writes (tests, logout). */
  async flush(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    await this.opts.storage.set(this.key('plaintext'), this.plaintext);
  }

  /** Destroy all local key material and sessions. The caller must re-open to generate new keys. */
  async reset(): Promise<void> {
    const { storage } = this.opts;
    await Promise.all([
      storage.del(this.key(`${this.opts.deviceId}:keys`)),
      storage.del(this.key('sessions')),
      storage.del(this.key('groups')),
      storage.del(this.key('plaintext')),
    ]);
    this.sessions = {};
    this.groups = { own: {}, peers: {} };
    this.plaintext = {};
  }
}

function parseControl(text: string): ControlMessage | null {
  if (!text.startsWith('{')) return null;
  try {
    const obj = JSON.parse(text) as Partial<ControlMessage>;
    if (
      obj.t === 'skdm' &&
      typeof obj.conversationId === 'string' &&
      obj.distribution &&
      typeof obj.distribution.chainKey === 'string'
    ) {
      return obj as ControlMessage;
    }
  } catch {
    /* not JSON */
  }
  return null;
}
